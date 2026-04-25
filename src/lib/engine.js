// Real chat engine: orchestrates optional search/fetch agent steps, OCR fallback,
// then opens an SSE stream against /api/chat and feeds chunks to the UI.
import { api } from './api.js';
import { uid, parseStream, tokenEstimate } from './utils.js';

const MAX_FETCH_TEXT_CHARS = 80 * 1024;

function trimFetchedText(text) {
  const value = String(text || '').trim();
  if (value.length <= MAX_FETCH_TEXT_CHARS) return value;
  return value.slice(0, MAX_FETCH_TEXT_CHARS) + '\n…（已截断）';
}

function toDisplayResults(results) {
  return (results || []).map(({ raw_content: _rawContent, ...result }) => result);
}

function buildSearchContext(searchResults, fetched) {
  const lines = [];
  if (searchResults?.length) {
    lines.push('以下是来自 Tavily 搜索的若干结果（按相关度排序）：');
    searchResults.forEach((r, i) => {
      lines.push(`[${i + 1}] ${r.title || '(无标题)'} — ${r.url}`);
      if (r.content) lines.push(`    摘要：${r.content.slice(0, 280)}`);
    });
  }
  if (fetched?.length) {
    lines.push('\n以下是其中部分网页的正文（可能被截断）：');
    fetched.forEach((f, i) => {
      const source = f.source === 'jina' ? 'r.jina.ai' : 'Tavily';
      lines.push(`\n--- 页面 ${i + 1}: ${f.url}（${source}）---\n${f.text}`);
    });
  }
  if (!lines.length) return '';
  lines.push('\n请基于以上资料作答；引用具体事实时附上对应链接。如资料不足，请明确说明。');
  return lines.join('\n');
}

async function runOcr({ images, ocrModel, prompt, signal }) {
  // Send the image(s) to the configured vision model and ask it to describe them.
  const messages = [
    {
      role: 'user',
      content: [
        {
          type: 'text',
          text: `请用中文详细描述以下图片中的所有可见信息（文字、图表、人物、场景等），尽量准确完整，便于后续模型理解。${
            prompt ? `\n用户的问题是：${prompt}` : ''
          }`,
        },
        ...images.map((src) => ({ type: 'image_url', image_url: { url: src } })),
      ],
    },
  ];
  const res = await api.chatStream({ model: ocrModel.id, messages, stream: false });
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(t || `OCR 模型调用失败（${res.status}）`);
  }
  const data = await res.json();
  return data?.choices?.[0]?.message?.content || '';
}

async function readSseStream(res, { onChunk, signal }) {
  if (!res.body) throw new Error('上游未返回流数据');
  const reader = res.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';
  let assistantText = '';
  let usage = null;

  const ABORT = signal
    ? new Promise((_, reject) => signal.addEventListener('abort', () => reject(new Error('aborted'))))
    : null;

  try {
    while (true) {
      const { value, done } = ABORT ? await Promise.race([reader.read(), ABORT]) : await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let idx;
      while ((idx = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, idx).replace(/\r$/, '');
        buffer = buffer.slice(idx + 1);
        if (!line.startsWith('data:')) continue;
        const payload = line.slice(5).trim();
        if (!payload || payload === '[DONE]') continue;
        let json;
        try {
          json = JSON.parse(payload);
        } catch {
          continue;
        }
        if (json.usage) usage = json.usage;
        const delta = json.choices?.[0]?.delta;
        if (!delta) continue;
        // Reasoning models may emit `reasoning_content` separately; merge it as <think>...</think>.
        if (delta.reasoning_content) {
          if (!assistantText.startsWith('<think>')) {
            assistantText = `<think>${delta.reasoning_content}`;
          } else if (assistantText.includes('</think>')) {
            // already closed; ignore further reasoning fragments
          } else {
            assistantText += delta.reasoning_content;
          }
        }
        if (delta.content) {
          if (assistantText.startsWith('<think>') && !assistantText.includes('</think>')) {
            assistantText += `</think>\n${delta.content}`;
          } else {
            assistantText += delta.content;
          }
        }
        onChunk(assistantText);
      }
    }
  } finally {
    try {
      reader.cancel();
    } catch {
      /* noop */
    }
  }
  return { text: assistantText, usage };
}

export function startChat({
  prompt,
  images = [],
  history = [],
  model,
  ocrModel,
  webSearchEnabled,
  config,
  onChunk,
  onAgent,
  onDone,
  onError,
}) {
  const controller = new AbortController();
  const startedAt = performance.now();

  async function run() {
    try {
      let augmentedPrompt = prompt;
      const augContext = [];

      // 1) Optional web search agent
      if (webSearchEnabled && prompt) {
        const useJinaFetch = !!config?.jinaFetchEnabled;
        const requestedTopK = Math.max(0, Math.min(10, Number(config?.fetchTopK ?? 3) || 0));
        const stepId = uid('step');
        onAgent({
          type: 'add',
          step: { id: stepId, kind: 'search', status: 'running', query: prompt, results: [] },
        });
        let results = [];
        try {
          const res = await api.search(prompt, {
            max_results: config?.tavilyMaxResults || 10,
            search_depth: config?.tavilySearchDepth || 'basic',
            include_raw_content: !useJinaFetch && requestedTopK > 0,
          });
          results = Array.isArray(res?.results) ? res.results : [];
          onAgent({
            type: 'update',
            id: stepId,
            patch: { status: 'done', count: results.length, results: toDisplayResults(results) },
          });
        } catch (e) {
          onAgent({
            type: 'update',
            id: stepId,
            patch: { status: 'error', error: String(e.message || e) },
          });
        }

        // 2) Fetch top-k pages. Default to Tavily raw_content; Jina is an optional fallback path.
        const topK = Math.max(0, Math.min(results.length, requestedTopK));
        const fetched = [];
        if (topK > 0) {
          const urls = results.slice(0, topK).map((r) => r.url).filter(Boolean);
          const fetchStepId = uid('step');
          if (useJinaFetch) {
            onAgent({
              type: 'add',
              step: {
                id: fetchStepId,
                kind: 'fetch',
                source: 'jina',
                status: 'running',
                urls,
                count: urls.length,
              },
            });
            await Promise.all(
              urls.map(async (u) => {
                try {
                  const text = await api.fetchUrl(u);
                  fetched.push({ url: u, text: trimFetchedText(text), source: 'jina' });
                } catch (e) {
                  fetched.push({ url: u, text: `（抓取失败：${e.message || e}）`, source: 'jina' });
                }
              })
            );
            onAgent({ type: 'update', id: fetchStepId, patch: { status: 'done' } });
          } else {
            results.slice(0, topK).forEach((r) => {
              const text = trimFetchedText(r.raw_content || r.content || '');
              if (r.url && text) fetched.push({ url: r.url, text, source: 'tavily' });
            });
            onAgent({
              type: 'add',
              step: {
                id: fetchStepId,
                kind: 'fetch',
                source: 'tavily',
                status: 'done',
                urls,
                count: fetched.length,
              },
            });
          }
        }

        const ctx = buildSearchContext(results, fetched);
        if (ctx) augContext.push(ctx);
      }

      // 3) OCR fallback for text-only models with attached images
      let userMessageContent;
      if (images.length && !model.vision) {
        if (!ocrModel) {
          throw new Error('当前模型不支持图片，且未配置 OCR 模型，请联系管理员');
        }
        const stepId = uid('step');
        onAgent({ type: 'add', step: { id: stepId, kind: 'ocr', status: 'running', model: ocrModel.name } });
        let ocrText;
        try {
          ocrText = await runOcr({ images, ocrModel, prompt, signal: controller.signal });
          onAgent({ type: 'update', id: stepId, patch: { status: 'done', text: ocrText } });
        } catch (e) {
          onAgent({ type: 'update', id: stepId, patch: { status: 'error', error: String(e.message || e) } });
          throw e;
        }
        const ocrContext = `（用户附带了图片，已由「${ocrModel.name}」识别如下）\n${ocrText}\n\n`;
        userMessageContent = `${ocrContext}用户问题：${prompt || '请基于以上图片内容回答。'}`;
      } else if (images.length && model.vision) {
        // Native multimodal: send images as image_url parts.
        userMessageContent = [
          { type: 'text', text: prompt || '请描述这些图片。' },
          ...images.map((src) => ({ type: 'image_url', image_url: { url: src } })),
        ];
      } else {
        userMessageContent = augContext.length
          ? `${augContext.join('\n\n')}\n\n用户问题：${prompt}`
          : prompt;
      }

      const messages = [
        ...history.map((h) => ({ role: h.role, content: h.content })),
        { role: 'user', content: userMessageContent },
      ];

      // 4) Open streaming chat
      const res = await api.chatStream({ model: model.id, stream: true, messages });
      if (!res.ok) {
        const t = await res.text().catch(() => '');
        let msg = t;
        try {
          msg = JSON.parse(t).error || t;
        } catch {
          /* keep as-is */
        }
        throw new Error(msg || `上游错误（${res.status}）`);
      }
      const { text, usage } = await readSseStream(res, { onChunk, signal: controller.signal });

      const elapsed = (performance.now() - startedAt) / 1000;
      const parsed = parseStream(text);
      const completionTokens =
        usage?.completion_tokens ?? tokenEstimate((parsed.thinking || '') + (parsed.content || ''));
      const promptTokens = usage?.prompt_tokens ?? tokenEstimate(prompt || '');
      const totalTokens = usage?.total_tokens ?? completionTokens + promptTokens;
      const tps = completionTokens / Math.max(elapsed, 0.001);
      onDone({ elapsed, completionTokens, promptTokens, totalTokens, tps });
    } catch (e) {
      if (controller.signal.aborted) {
        onDone({ elapsed: 0, completionTokens: 0, promptTokens: 0, totalTokens: 0, tps: 0, aborted: true });
      } else {
        onError(e);
      }
    }
  }

  run();
  return { stop: () => controller.abort() };
}

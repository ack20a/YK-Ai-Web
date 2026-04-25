// Real chat engine: orchestrates optional model-planned search/fetch agent steps, OCR fallback,
// then opens an SSE stream against /api/chat and feeds chunks to the UI.
import { api } from './api.js';
import { uid, parseStream, tokenEstimate } from './utils.js';

const MAX_FETCH_TEXT_CHARS = 80 * 1024;
const MAX_CONTEXT_PAGE_CHARS = 20 * 1024;
const MAX_REVIEW_PAGE_CHARS = 3600;
const MAX_AGENT_QUERIES = 2;

function clampNumber(value, min, max, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(n)));
}

function trimText(text, max) {
  const value = String(text || '').trim();
  if (value.length <= max) return value;
  return value.slice(0, max) + '\n…（已截断）';
}

function trimFetchedText(text) {
  return trimText(text, MAX_FETCH_TEXT_CHARS);
}

function toDisplayResults(results) {
  return (results || []).map(({ raw_content: _rawContent, ...result }) => result);
}

function normalizeQueries(queries, fallback = '') {
  const source = Array.isArray(queries) ? queries : queries ? [queries] : [];
  const seen = new Set();
  const normalized = source
    .map((q) => String(q || '').replace(/\s+/g, ' ').trim())
    .filter((q) => q.length >= 2 && q.length <= 120)
    .filter((q) => {
      const key = q.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, MAX_AGENT_QUERIES);

  if (!normalized.length && fallback) return [trimText(fallback.replace(/\s+/g, ' '), 120)];
  return normalized;
}

function uniqueResults(results, seenUrls = new Set()) {
  const out = [];
  for (const r of results || []) {
    if (!r?.url || seenUrls.has(r.url)) continue;
    seenUrls.add(r.url);
    out.push(r);
  }
  return out;
}

function extractJsonObject(text) {
  const raw = String(text || '').replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1].trim() : raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1);
  if (!candidate) return null;
  try {
    return JSON.parse(candidate);
  } catch {
    return null;
  }
}

function throwIfAborted(signal) {
  if (signal?.aborted) throw new Error('aborted');
}

function formatRecentHistory(history) {
  return (history || [])
    .slice(-6)
    .map((m) => {
      const role = m.role === 'assistant' ? '助手' : '用户';
      const content = typeof m.content === 'string' ? parseStream(m.content).content || m.content : '';
      return `${role}：${trimText(content, 600)}`;
    })
    .filter(Boolean)
    .join('\n');
}

async function runAgentJson({ model, messages, maxTokens = 800, signal }) {
  throwIfAborted(signal);
  const res = await api.chatStream({
    model: model.id,
    messages,
    stream: false,
    temperature: 0.2,
    max_tokens: maxTokens,
  });
  throwIfAborted(signal);
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(t || `搜索代理模型调用失败（${res.status}）`);
  }
  const data = await res.json();
  const content = data?.choices?.[0]?.message?.content || '';
  return { raw: content, json: extractJsonObject(content) };
}

async function planSearchRound({ model, prompt, history, round, previousReview, suggestedQueries, signal, onAgent }) {
  const stepId = uid('step');
  onAgent({
    type: 'add',
    step: { id: stepId, kind: 'plan', status: 'running', round, title: `正在规划第 ${round} 轮搜索…` },
  });

  const historyText = formatRecentHistory(history);
  const hint = suggestedQueries?.length ? `\n上一轮建议的搜索词：${suggestedQueries.join('；')}` : '';
  const review = previousReview ? `\n上一轮资料评估：${previousReview}` : '';
  let json = null;
  try {
    const res = await runAgentJson({
      model,
      signal,
      maxTokens: 700,
      messages: [
        {
          role: 'user',
          content: `你是联网搜索规划器。请根据用户问题和最近对话，决定下一轮应该搜索什么。\n\n要求：\n- 只输出 JSON 对象，不要输出 Markdown。\n- 不要把用户整段问题原样作为搜索词，要提炼成适合 Tavily 的关键词。\n- 最多给出 ${MAX_AGENT_QUERIES} 个搜索词。\n- 如果不需要继续联网搜索，search_needed=false 且 queries=[]。\n- reason 只写一句对外可展示的规划摘要，不要写隐藏推理过程。\n\nJSON 格式：\n{"search_needed":true,"reason":"...","queries":["..."]}\n\n最近对话：\n${historyText || '（无）'}\n\n用户问题：${prompt}${review}${hint}`,
        },
      ],
    });
    json = res.json;
  } catch (e) {
    const queries = normalizeQueries(suggestedQueries?.length ? suggestedQueries : [prompt]);
    const reason = '搜索规划失败，已使用问题关键词继续检索。';
    onAgent({
      type: 'update',
      id: stepId,
      patch: { status: 'done', searchNeeded: true, queries, reason, warning: String(e.message || e) },
    });
    return { searchNeeded: true, queries, reason };
  }

  const searchNeeded = json?.search_needed !== false;
  const queries = searchNeeded ? normalizeQueries(json?.queries, round === 1 ? prompt : '') : [];
  const reason = trimText(json?.reason || (queries.length ? '已生成搜索词。' : '无需继续搜索。'), 120);
  const plan = { searchNeeded: searchNeeded && queries.length > 0, queries, reason };
  onAgent({
    type: 'update',
    id: stepId,
    patch: { status: 'done', searchNeeded: plan.searchNeeded, queries, reason },
  });
  return plan;
}

function formatReviewMaterials(fetched, results) {
  if (fetched.length) {
    return fetched
      .map((f) => {
        const title = f.title ? `标题：${f.title}\n` : '';
        return `[${f.id}] ${title}URL：${f.url}\n搜索词：${f.query || '未知'}\n正文摘录：\n${trimText(f.text, MAX_REVIEW_PAGE_CHARS)}`;
      })
      .join('\n\n');
  }
  return (results || [])
    .slice(0, 8)
    .map((r, i) => `[R${i + 1}] 标题：${r.title || '(无标题)'}\nURL：${r.url}\n摘要：${r.content || '（无摘要）'}`)
    .join('\n\n');
}

function normalizeRelevantIds(value, fetched) {
  const ids = new Set(fetched.map((f) => f.id));
  const byPosition = fetched.reduce((acc, f, index) => ({ ...acc, [String(index + 1)]: f.id }), {});
  const normalized = (Array.isArray(value) ? value : [])
    .map((id) => String(id || '').trim().toUpperCase().replace(/^#/, ''))
    .map((id) => (ids.has(id) ? id : byPosition[id] || (ids.has(`S${id}`) ? `S${id}` : '')))
    .filter(Boolean);
  return [...new Set(normalized)];
}

function cleanOneLine(text, max = 120) {
  return trimText(String(text || '').replace(/\s+/g, ' '), max);
}

function citationSourcesFromFetched(fetched) {
  const seen = new Set();
  return (fetched || [])
    .filter((f) => f?.id && f?.url && !seen.has(f.url) && (seen.add(f.url), true))
    .map((f) => ({ id: f.id, title: cleanOneLine(f.title || f.url), url: f.url }));
}

function buildCitationFooter(sources) {
  if (!sources?.length) return '';
  const lines = ['\n\n---', '', '**引用来源**'];
  sources.forEach((source) => {
    lines.push(`- [${source.id}] ${source.title} - ${source.url}`);
  });
  return lines.join('\n');
}

async function reviewSearchRound({ model, prompt, history, round, fetched, results, signal, onAgent }) {
  const stepId = uid('step');
  onAgent({
    type: 'add',
    step: { id: stepId, kind: 'review', status: 'running', round, title: `正在评估第 ${round} 轮资料…` },
  });

  if (!fetched.length && !results.length) {
    const review = {
      assessment: '本轮没有获得可用搜索结果。',
      relevantIds: [],
      needMore: true,
      nextQueries: normalizeQueries([prompt]),
    };
    onAgent({ type: 'update', id: stepId, patch: { status: 'done', ...review } });
    return review;
  }

  let json = null;
  try {
    const res = await runAgentJson({
      model,
      signal,
      maxTokens: 900,
      messages: [
        {
          role: 'user',
          content: `你是搜索结果评估器。请判断已获取资料是否能回答用户问题，并决定是否需要继续搜索。\n\n要求：\n- 只输出 JSON 对象，不要输出 Markdown。\n- assessment 写一句对外可展示的评估摘要，不要写隐藏推理过程。\n- relevant_source_ids 只能包含资料编号，如 ["S1","S3"]；如果没有相关资料则为空数组。\n- 如果资料不足或明显不相关，need_more=true，并给出最多 ${MAX_AGENT_QUERIES} 个 next_queries。\n- 如果资料已足够，need_more=false，next_queries=[]。\n\nJSON 格式：\n{"assessment":"...","relevant_source_ids":["S1"],"need_more":false,"next_queries":[]}\n\n最近对话：\n${formatRecentHistory(history) || '（无）'}\n\n用户问题：${prompt}\n\n本轮资料：\n${formatReviewMaterials(fetched, results)}`,
        },
      ],
    });
    json = res.json;
  } catch (e) {
    const review = {
      assessment: '资料评估失败，已保留本轮获取到的正文供最终回答参考。',
      relevantIds: fetched.map((f) => f.id),
      needMore: false,
      nextQueries: [],
      warning: String(e.message || e),
    };
    onAgent({ type: 'update', id: stepId, patch: { status: 'done', ...review } });
    return review;
  }

  const relevantIds = normalizeRelevantIds(json?.relevant_source_ids, fetched);
  const nextQueries = normalizeQueries(json?.next_queries || [], '');
  const review = {
    assessment: trimText(json?.assessment || '已完成资料相关性评估。', 160),
    relevantIds,
    needMore: !!json?.need_more && nextQueries.length > 0,
    nextQueries,
  };
  onAgent({ type: 'update', id: stepId, patch: { status: 'done', ...review } });
  return review;
}

function buildSearchContext(searchResults, fetched, reviews = []) {
  const lines = [];
  if (reviews.length) {
    lines.push('以下是搜索代理对资料相关性的评估摘要：');
    reviews.forEach((r, i) => lines.push(`第 ${i + 1} 轮：${r.assessment}`));
  }
  if (searchResults?.length) {
    lines.push(`${lines.length ? '\n' : ''}以下是来自 Tavily 搜索的若干结果（按相关度排序）：`);
    searchResults.forEach((r, i) => {
      lines.push(`[${i + 1}] ${r.title || '(无标题)'} — ${r.url}`);
      if (r.content) lines.push(`    摘要：${r.content.slice(0, 280)}`);
    });
  }
  if (fetched?.length) {
    lines.push('\n可引用来源编号（正文引用时只需写 [S1] 这类编号）：');
    fetched.forEach((f) => {
      if (f.id && f.url) lines.push(`[${f.id}] ${cleanOneLine(f.title || f.url)} - ${f.url}`);
    });
    lines.push('\n以下是其中部分网页的正文（可能被截断）：');
    fetched.forEach((f, i) => {
      const source = f.source === 'jina' ? 'r.jina.ai' : 'Tavily';
      const label = f.id ? `资料 ${f.id}` : `页面 ${i + 1}`;
      lines.push(`\n--- ${label}: ${f.url}（${source}）---\n${trimText(f.text, MAX_CONTEXT_PAGE_CHARS)}`);
    });
  }
  if (!lines.length) return '';
  lines.push('\n请基于以上资料作答；引用具体事实时优先使用 [S1] 这类来源编号，无需重复粘贴完整 URL，也不需要单独列来源，系统会自动附引用来源列表。如资料不足，请明确说明。');
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
      const augContext = [];
      let citationSources = [];

      // 1) Optional web search agent
      if (webSearchEnabled && prompt) {
        const useJinaFetch = !!config?.jinaFetchEnabled;
        const requestedTopK = clampNumber(config?.fetchTopK, 0, 10, 3);
        const maxRounds = clampNumber(config?.searchAgentMaxRounds, 1, 3, 2);
        const maxResults = clampNumber(config?.tavilyMaxResults, 1, 20, 10);
        const searchDepth = config?.tavilySearchDepth === 'advanced' ? 'advanced' : 'basic';
        const allResults = [];
        const allFetched = [];
        const reviews = [];
        const relevantIds = new Set();
        const seenUrls = new Set();
        let previousReview = '';
        let suggestedQueries = [];
        let sourceSeq = 0;

        for (let round = 1; round <= maxRounds; round += 1) {
          const plan = await planSearchRound({
            model,
            prompt,
            history,
            round,
            previousReview,
            suggestedQueries,
            signal: controller.signal,
            onAgent,
          });
          throwIfAborted(controller.signal);
          if (!plan.searchNeeded) break;

          const roundResults = [];
          for (const query of plan.queries) {
            const stepId = uid('step');
            onAgent({
              type: 'add',
              step: { id: stepId, kind: 'search', status: 'running', round, query, results: [] },
            });
            try {
              const res = await api.search(query, {
                max_results: maxResults,
                search_depth: searchDepth,
                include_raw_content: !useJinaFetch && requestedTopK > 0,
              });
              const queryResults = (Array.isArray(res?.results) ? res.results : []).map((r) => ({ ...r, query }));
              roundResults.push(...queryResults);
              onAgent({
                type: 'update',
                id: stepId,
                patch: { status: 'done', count: queryResults.length, results: toDisplayResults(queryResults) },
              });
            } catch (e) {
              onAgent({
                type: 'update',
                id: stepId,
                patch: { status: 'error', error: String(e.message || e) },
              });
            }
            throwIfAborted(controller.signal);
          }

          const uniqueRoundResults = uniqueResults(roundResults, seenUrls);
          allResults.push(...uniqueRoundResults);
          const roundFetched = [];
          const topK = Math.max(0, Math.min(uniqueRoundResults.length, requestedTopK));
          if (topK > 0) {
            const selected = uniqueRoundResults.slice(0, topK);
            const urls = selected.map((r) => r.url).filter(Boolean);
            const fetchStepId = uid('step');
            if (useJinaFetch) {
              onAgent({
                type: 'add',
                step: {
                  id: fetchStepId,
                  kind: 'fetch',
                  source: 'jina',
                  status: 'running',
                  round,
                  urls,
                  count: urls.length,
                },
              });
              const fetched = await Promise.all(
                selected.map(async (r) => {
                  try {
                    const text = await api.fetchUrl(r.url);
                    return {
                      id: `S${++sourceSeq}`,
                      title: r.title,
                      url: r.url,
                      query: r.query,
                      text: trimFetchedText(text),
                      source: 'jina',
                    };
                  } catch (e) {
                    return {
                      id: `S${++sourceSeq}`,
                      title: r.title,
                      url: r.url,
                      query: r.query,
                      text: `（抓取失败：${e.message || e}）`,
                      source: 'jina',
                    };
                  }
                })
              );
              roundFetched.push(...fetched);
              onAgent({ type: 'update', id: fetchStepId, patch: { status: 'done', count: fetched.length } });
            } else {
              selected.forEach((r) => {
                const text = trimFetchedText(r.raw_content || r.content || '');
                if (!r.url || !text) return;
                roundFetched.push({
                  id: `S${++sourceSeq}`,
                  title: r.title,
                  url: r.url,
                  query: r.query,
                  text,
                  source: 'tavily',
                });
              });
              onAgent({
                type: 'add',
                step: {
                  id: fetchStepId,
                  kind: 'fetch',
                  source: 'tavily',
                  status: 'done',
                  round,
                  urls,
                  count: roundFetched.length,
                },
              });
            }
          }

          allFetched.push(...roundFetched);
          const review = await reviewSearchRound({
            model,
            prompt,
            history,
            round,
            fetched: roundFetched,
            results: uniqueRoundResults,
            signal: controller.signal,
            onAgent,
          });
          reviews.push(review);
          review.relevantIds.forEach((id) => relevantIds.add(id));
          previousReview = review.assessment;
          suggestedQueries = review.nextQueries;
          if (!review.needMore || !suggestedQueries.length) break;
        }

        const relevantFetched = allFetched.filter((f) => relevantIds.has(f.id));
        const fetchedForContext = relevantFetched.length ? relevantFetched : reviews.length ? [] : allFetched;
        citationSources = citationSourcesFromFetched(fetchedForContext);
        const ctx = buildSearchContext(toDisplayResults(allResults), fetchedForContext, reviews);
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
      const finalText = citationSources.length ? text + buildCitationFooter(citationSources) : text;
      if (finalText !== text) onChunk(finalText);

      const elapsed = (performance.now() - startedAt) / 1000;
      const parsed = parseStream(finalText);
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

// Tavily search proxy. Authenticated. Uses admin-configured depth/max_results
// unless the caller overrides them within the allowed range.
import { requireAuth, jsonResponse } from './_lib/auth.js';
import { getConfig } from './_lib/store.js';

const MAX_RAW_CONTENT_CHARS = 80 * 1024;

function trimRawContent(data) {
  if (!data || !Array.isArray(data.results)) return data;
  return {
    ...data,
    results: data.results.map((result) => {
      if (typeof result.raw_content !== 'string' || result.raw_content.length <= MAX_RAW_CONTENT_CHARS) {
        return result;
      }
      return {
        ...result,
        raw_content: result.raw_content.slice(0, MAX_RAW_CONTENT_CHARS) + '\n…（已截断）',
      };
    }),
  };
}

export default async (req) => {
  if (req.method !== 'POST') return new Response('Method Not Allowed', { status: 405 });
  const guard = requireAuth(req);
  if (guard.error) return guard.error;

  const key = process.env.TAVILY_API_KEY;
  if (!key) return jsonResponse({ error: '服务端未配置 TAVILY_API_KEY' }, 500);

  let body;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: '请求格式错误' }, 400);
  }
  const query = String(body.query || '').trim();
  if (!query) return jsonResponse({ error: '缺少查询词' }, 400);

  const cfg = await getConfig();
  const max_results = Math.min(20, Math.max(1, Number(body.max_results) || cfg.tavilyMaxResults || 10));
  const search_depth =
    body.search_depth === 'advanced' || cfg.tavilySearchDepth === 'advanced' ? 'advanced' : 'basic';
  const include_raw_content =
    body.include_raw_content === undefined
      ? !cfg.jinaFetchEnabled && (cfg.fetchTopK ?? 3) > 0
      : !!body.include_raw_content;

  const r = await fetch('https://api.tavily.com/search', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      api_key: key,
      query,
      max_results,
      search_depth,
      include_answer: false,
      include_raw_content,
    }),
  });
  const text = await r.text();
  if (r.ok && include_raw_content) {
    try {
      return jsonResponse(trimRawContent(JSON.parse(text)), r.status);
    } catch {
      /* fall through to raw upstream response */
    }
  }
  return new Response(text, {
    status: r.status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
};

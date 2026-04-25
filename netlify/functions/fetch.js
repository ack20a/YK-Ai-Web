// URL fetcher proxied through r.jina.ai for clean readable plain text.
// Authenticated. Hard cap on response size to keep the model's context lean.
import { requireAuth, jsonResponse } from './_lib/auth.js';

const MAX_BYTES = 80 * 1024; // 80KB per fetched page

export default async (req) => {
  const guard = requireAuth(req);
  if (guard.error) return guard.error;

  const u = new URL(req.url).searchParams.get('url');
  if (!u) return jsonResponse({ error: '缺少 url 参数' }, 400);

  let parsed;
  try {
    parsed = new URL(u);
  } catch {
    return jsonResponse({ error: 'url 不是合法地址' }, 400);
  }
  if (!/^https?:$/.test(parsed.protocol)) {
    return jsonResponse({ error: '仅支持 http(s) 协议' }, 400);
  }

  const target = `https://r.jina.ai/${parsed.toString()}`;
  const headers = { accept: 'text/plain' };
  if (process.env.JINA_API_KEY) headers.authorization = `Bearer ${process.env.JINA_API_KEY}`;

  const r = await fetch(target, { headers });
  let text = await r.text();
  if (text.length > MAX_BYTES) text = text.slice(0, MAX_BYTES) + '\n…（已截断）';

  return new Response(text, {
    status: r.status,
    headers: { 'content-type': 'text/plain; charset=utf-8' },
  });
};

// Streaming chat completion proxy. Injects the admin-managed system prompt
// for the requested model and forwards SSE chunks to the client unchanged.
import { requireAuth, jsonResponse } from './_lib/auth.js';
import { getConfig } from './_lib/store.js';

const BASE = (process.env.ONEAPI_BASE || 'https://one-api.ack20.eu.org/v1').replace(/\/+$/, '');

export default async (req) => {
  if (req.method !== 'POST') return new Response('Method Not Allowed', { status: 405 });
  const guard = requireAuth(req);
  if (guard.error) return guard.error;

  const key = process.env.ONEAPI_KEY;
  if (!key) return jsonResponse({ error: '服务端未配置 ONEAPI_KEY' }, 500);

  let body;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: '请求格式错误' }, 400);
  }

  const cfg = await getConfig();
  const model = (cfg.models || []).find((m) => m.id === body.model && m.enabled);
  if (!model) return jsonResponse({ error: '所选模型不可用' }, 400);

  const sys = (cfg.perModelPrompts && cfg.perModelPrompts[model.id]) || cfg.systemPrompt || '';
  const incoming = Array.isArray(body.messages) ? body.messages : [];
  // Drop any client-supplied system messages — admin's system prompt is authoritative.
  const filtered = incoming.filter((m) => m && m.role !== 'system');
  const messages = sys ? [{ role: 'system', content: sys }, ...filtered] : filtered;

  const upstream = await fetch(`${BASE}/chat/completions`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${key}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: model.id,
      stream: body.stream !== false,
      messages,
      ...(Number.isFinite(body.temperature) ? { temperature: body.temperature } : {}),
      ...(Number.isFinite(body.max_tokens) ? { max_tokens: body.max_tokens } : {}),
    }),
  });

  if (!upstream.ok && !upstream.body) {
    const text = await upstream.text().catch(() => '');
    return jsonResponse({ error: text || `上游错误 ${upstream.status}` }, upstream.status);
  }

  return new Response(upstream.body, {
    status: upstream.status,
    headers: {
      'content-type': upstream.headers.get('content-type') || 'text/event-stream',
      'cache-control': 'no-cache, no-transform',
      'x-accel-buffering': 'no',
    },
  });
};

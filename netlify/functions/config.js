import { requireAuth, requireAdmin, jsonResponse } from './_lib/auth.js';
import { getConfig, setConfig } from './_lib/store.js';

function sanitizeModel(m) {
  if (!m || typeof m.id !== 'string' || typeof m.name !== 'string') return null;
  return {
    id: m.id.trim(),
    name: m.name.trim(),
    provider: typeof m.provider === 'string' ? m.provider.trim() : '',
    desc: typeof m.desc === 'string' ? m.desc.trim() : '',
    vision: !!m.vision,
    reasoning: !!m.reasoning,
    enabled: m.enabled !== false,
  };
}

function sanitizeConfig(input) {
  const out = {};
  if (Array.isArray(input.models)) {
    out.models = input.models.map(sanitizeModel).filter(Boolean);
    // Dedup by id
    const seen = new Set();
    out.models = out.models.filter((m) => (seen.has(m.id) ? false : (seen.add(m.id), true)));
  }
  if (typeof input.systemPrompt === 'string') out.systemPrompt = input.systemPrompt;
  if (input.perModelPrompts && typeof input.perModelPrompts === 'object') {
    const sane = {};
    for (const [k, v] of Object.entries(input.perModelPrompts)) {
      if (typeof v === 'string' && v.trim()) sane[k] = v;
    }
    out.perModelPrompts = sane;
  }
  if (typeof input.ocrModelId === 'string') out.ocrModelId = input.ocrModelId;
  if (input.tavilySearchDepth === 'basic' || input.tavilySearchDepth === 'advanced') {
    out.tavilySearchDepth = input.tavilySearchDepth;
  }
  if (Number.isFinite(input.tavilyMaxResults)) {
    out.tavilyMaxResults = Math.min(20, Math.max(1, Math.floor(input.tavilyMaxResults)));
  }
  if (Number.isFinite(input.fetchTopK)) {
    out.fetchTopK = Math.min(10, Math.max(0, Math.floor(input.fetchTopK)));
  }
  return out;
}

export default async (req) => {
  if (req.method === 'GET') {
    const r = requireAuth(req);
    if (r.error) return r.error;
    const cfg = await getConfig();
    // Plain users don't need to know server-side fetch tuning, but it's harmless.
    return jsonResponse({ config: cfg });
  }
  if (req.method === 'POST' || req.method === 'PUT') {
    const r = requireAdmin(req);
    if (r.error) return r.error;
    let body;
    try {
      body = await req.json();
    } catch {
      return jsonResponse({ error: '请求格式错误' }, 400);
    }
    const patch = sanitizeConfig(body || {});
    const next = await setConfig(patch);
    return jsonResponse({ config: next });
  }
  return new Response('Method Not Allowed', { status: 405 });
};

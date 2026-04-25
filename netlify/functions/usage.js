// Usage tracking endpoint.
// GET (admin): aggregated stats for the dashboard.
// POST (any auth): client-reported deltas after a chat finishes.
import { requireAuth, requireAdmin, jsonResponse } from './_lib/auth.js';
import { getUsage, recordUsage, getUsers, publicUser } from './_lib/store.js';

export default async (req) => {
  if (req.method === 'GET') {
    const r = requireAdmin(req);
    if (r.error) return r.error;
    const [usage, users] = await Promise.all([getUsage(), getUsers()]);
    return jsonResponse({ usage, users: users.map(publicUser) });
  }

  if (req.method === 'POST') {
    const r = requireAuth(req);
    if (r.error) return r.error;
    let body;
    try {
      body = await req.json();
    } catch {
      return jsonResponse({ error: '请求格式错误' }, 400);
    }
    const tokens = Math.max(0, Math.min(1_000_000, Number(body.tokens) || 0));
    const conversation = !!body.newConversation;
    const usage = await recordUsage({ userId: r.user.sub, tokens, conversation });
    return jsonResponse({ ok: true, usage });
  }

  return new Response('Method Not Allowed', { status: 405 });
};

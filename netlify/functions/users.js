import { requireAdmin, jsonResponse, hashPassword } from './_lib/auth.js';
import {
  getUsers,
  upsertUser,
  patchUser,
  deleteUser,
  findUserByEmail,
  publicUser,
} from './_lib/store.js';

export const config = { path: ['/api/users', '/api/users/*'] };

function idFromPath(req) {
  const url = new URL(req.url);
  const m = url.pathname.match(/\/api\/users\/([^/]+)$/);
  return m ? decodeURIComponent(m[1]) : null;
}

export default async (req) => {
  const guard = requireAdmin(req);
  if (guard.error) return guard.error;
  const me = guard.user;
  const id = idFromPath(req);

  if (req.method === 'GET') {
    const users = await getUsers();
    return jsonResponse({ users: users.map(publicUser) });
  }

  if (req.method === 'POST' && !id) {
    let body;
    try {
      body = await req.json();
    } catch {
      return jsonResponse({ error: '请求格式错误' }, 400);
    }
    const email = String(body.email || '').trim().toLowerCase();
    const name = String(body.name || '').trim() || email.split('@')[0];
    const role = body.role === 'admin' ? 'admin' : 'user';
    const password = String(body.password || '');
    if (!email.includes('@')) return jsonResponse({ error: '请输入合法邮箱' }, 400);
    if (password.length < 6) return jsonResponse({ error: '密码至少 6 位' }, 400);
    if (await findUserByEmail(email)) return jsonResponse({ error: '该邮箱已存在' }, 409);
    const user = {
      id: 'u_' + Math.random().toString(36).slice(2, 10),
      email,
      name,
      role,
      enabled: true,
      passwordHash: hashPassword(password),
      createdAt: new Date().toISOString(),
      lastLoginAt: null,
    };
    await upsertUser(user);
    return jsonResponse({ user: publicUser(user) }, 201);
  }

  if (req.method === 'PATCH' && id) {
    let body;
    try {
      body = await req.json();
    } catch {
      return jsonResponse({ error: '请求格式错误' }, 400);
    }
    const patch = {};
    if (typeof body.name === 'string') patch.name = body.name.trim();
    if (body.role === 'admin' || body.role === 'user') patch.role = body.role;
    if (typeof body.enabled === 'boolean') patch.enabled = body.enabled;
    if (typeof body.password === 'string' && body.password.length >= 6) {
      patch.passwordHash = hashPassword(body.password);
    }
    // Don't allow demoting the only admin or disabling oneself by accident.
    if ((patch.role === 'user' || patch.enabled === false) && id === me.sub) {
      return jsonResponse({ error: '不能修改自己的角色或禁用自己' }, 400);
    }
    const next = await patchUser(id, patch);
    if (!next) return jsonResponse({ error: '用户不存在' }, 404);
    return jsonResponse({ user: publicUser(next) });
  }

  if (req.method === 'DELETE' && id) {
    if (id === me.sub) return jsonResponse({ error: '不能删除自己' }, 400);
    const ok = await deleteUser(id);
    if (!ok) return jsonResponse({ error: '用户不存在' }, 404);
    return jsonResponse({ ok: true });
  }

  return new Response('Method Not Allowed', { status: 405 });
};

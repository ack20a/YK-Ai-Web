import {
  ensureBootstrapAdmin,
  findUserByEmail,
  patchUser,
  publicUser,
} from './_lib/store.js';
import { signToken, verifyPassword, jsonResponse } from './_lib/auth.js';

export default async (req) => {
  if (req.method !== 'POST') return new Response('Method Not Allowed', { status: 405 });

  let body;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: '请求格式错误' }, 400);
  }
  const email = String(body.email || '').trim().toLowerCase();
  const password = String(body.password || '');
  if (!email || !password) {
    return jsonResponse({ error: '请输入邮箱和密码' }, 400);
  }

  try {
    await ensureBootstrapAdmin();
  } catch (e) {
    return jsonResponse({ error: e.message }, 500);
  }

  const user = await findUserByEmail(email);
  if (!user || !user.enabled) {
    return jsonResponse({ error: '邮箱或密码错误' }, 401);
  }
  if (!verifyPassword(password, user.passwordHash)) {
    return jsonResponse({ error: '邮箱或密码错误' }, 401);
  }

  await patchUser(user.id, { lastLoginAt: new Date().toISOString() });

  const token = signToken({ sub: user.id, email: user.email, role: user.role, name: user.name });
  return jsonResponse({ token, user: publicUser({ ...user, lastLoginAt: new Date().toISOString() }) });
};

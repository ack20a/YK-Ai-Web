import { requireAuth, jsonResponse } from './_lib/auth.js';
import { getUsers, publicUser } from './_lib/store.js';

export default async (req) => {
  const r = requireAuth(req);
  if (r.error) return r.error;
  const users = await getUsers();
  const user = users.find((u) => u.id === r.user.sub);
  if (!user || !user.enabled) return jsonResponse({ error: 'unauthorized' }, 401);
  return jsonResponse({ user: publicUser(user) });
};

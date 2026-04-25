import { loadToken, saveToken } from './utils.js';

class ApiError extends Error {
  constructor(message, status, data) {
    super(message);
    this.status = status;
    this.data = data;
  }
}

async function request(path, { method = 'GET', body, raw = false } = {}) {
  const headers = {};
  const token = loadToken();
  if (token) headers.authorization = `Bearer ${token}`;
  if (body !== undefined && !(body instanceof FormData)) {
    headers['content-type'] = 'application/json';
  }
  const res = await fetch(path, {
    method,
    headers,
    body: body === undefined ? undefined : body instanceof FormData ? body : JSON.stringify(body),
  });

  if (res.status === 401) {
    saveToken(null);
  }

  if (raw) return res;
  const text = await res.text();
  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = { raw: text };
    }
  }
  if (!res.ok) {
    throw new ApiError(data?.error || `请求失败（${res.status}）`, res.status, data);
  }
  return data;
}

export const api = {
  login: (email, password) => request('/api/auth/login', { method: 'POST', body: { email, password } }),
  me: () => request('/api/auth/me'),
  getConfig: () => request('/api/config'),
  saveConfig: (patch) => request('/api/config', { method: 'POST', body: patch }),
  listUsers: () => request('/api/users'),
  createUser: (user) => request('/api/users', { method: 'POST', body: user }),
  updateUser: (id, patch) => request(`/api/users/${encodeURIComponent(id)}`, { method: 'PATCH', body: patch }),
  deleteUser: (id) => request(`/api/users/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  search: (query, opts = {}) => request('/api/search', { method: 'POST', body: { query, ...opts } }),
  fetchUrl: async (url) => {
    const r = await request(`/api/fetch?url=${encodeURIComponent(url)}`, { raw: true });
    return r.text();
  },
  reportUsage: (payload) => request('/api/usage', { method: 'POST', body: payload }),
  getUsage: () => request('/api/usage'),
  chatStream: (payload) => request('/api/chat', { method: 'POST', body: payload, raw: true }),
};

export { ApiError };

// Persistence layer backed by Netlify Blobs.
// Falls back to an in-memory dev store when running outside Netlify (e.g. `vite preview`).
import { getStore } from '@netlify/blobs';
import { hashPassword } from './auth.js';

const STORE_NAME = 'yk-ai-state';
const USERS_KEY = 'users';
const CONFIG_KEY = 'config';
const USAGE_KEY = 'usage';

const memoryStore = new Map();

function blobsAvailable() {
  return !!(process.env.NETLIFY_BLOBS_CONTEXT || process.env.NETLIFY || process.env.SITE_ID);
}

function store() {
  if (!blobsAvailable()) {
    return {
      async get(key) {
        const v = memoryStore.get(key);
        return v ? JSON.parse(v) : null;
      },
      async setJSON(key, value) {
        memoryStore.set(key, JSON.stringify(value));
      },
    };
  }
  const s = getStore({ name: STORE_NAME, consistency: 'strong' });
  return {
    async get(key) {
      try {
        return await s.get(key, { type: 'json' });
      } catch {
        return null;
      }
    },
    async setJSON(key, value) {
      await s.setJSON(key, value);
    },
  };
}

export const DEFAULT_MODELS = [
  {
    id: 'openai/gpt-oss-120b',
    name: 'GPT-OSS 120B',
    provider: 'OpenAI',
    desc: '默认模型，思考能力强，仅支持文本',
    vision: false,
    reasoning: true,
    enabled: true,
  },
  {
    id: 'openai/gpt-oss-20b',
    name: 'GPT-OSS 20B',
    provider: 'OpenAI',
    desc: '更快的思考模型，仅支持文本',
    vision: false,
    reasoning: true,
    enabled: true,
  },
];

export const DEFAULT_PROMPT = `你是 YK AI，一个专业、严谨、友好的中文 AI 助手。

- 使用简体中文回复，除非用户明确要求其他语言。
- 在不确定时主动表明，避免编造事实。
- 回答应当条理清晰、准确简洁。
- 当系统提供网络搜索结果时，请基于这些资料回答，并在引用具体事实时注明来源链接。`;

const DEFAULT_CONFIG = {
  models: DEFAULT_MODELS,
  systemPrompt: DEFAULT_PROMPT,
  perModelPrompts: {},
  ocrModelId: '',
  tavilySearchDepth: 'basic',
  tavilyMaxResults: 10,
  fetchTopK: 3,
  jinaFetchEnabled: false,
};

export async function getConfig() {
  const s = store();
  const existing = await s.get(CONFIG_KEY);
  if (!existing) {
    await s.setJSON(CONFIG_KEY, DEFAULT_CONFIG);
    return { ...DEFAULT_CONFIG };
  }
  return { ...DEFAULT_CONFIG, ...existing };
}

export async function setConfig(patch) {
  const current = await getConfig();
  const next = { ...current, ...patch };
  await store().setJSON(CONFIG_KEY, next);
  return next;
}

export async function getUsers() {
  const s = store();
  const raw = await s.get(USERS_KEY);
  if (raw && Array.isArray(raw.users)) return raw.users;
  return [];
}

async function writeUsers(users) {
  await store().setJSON(USERS_KEY, { users });
}

export async function ensureBootstrapAdmin() {
  const users = await getUsers();
  if (users.length > 0) return;
  const email = (process.env.INITIAL_ADMIN_EMAIL || '').trim().toLowerCase();
  const password = process.env.INITIAL_ADMIN_PASSWORD || '';
  if (!email || !password) {
    throw new Error(
      '尚未初始化管理员账号。请在 Netlify 环境变量中配置 INITIAL_ADMIN_EMAIL 与 INITIAL_ADMIN_PASSWORD（首次登录后即可移除）。'
    );
  }
  const now = new Date().toISOString();
  const admin = {
    id: 'u_' + Math.random().toString(36).slice(2, 10),
    email,
    name: email.split('@')[0],
    role: 'admin',
    enabled: true,
    passwordHash: hashPassword(password),
    createdAt: now,
    lastLoginAt: null,
  };
  await writeUsers([admin]);
}

export async function findUserByEmail(email) {
  const users = await getUsers();
  return users.find((u) => u.email.toLowerCase() === email.toLowerCase()) || null;
}

export async function upsertUser(user) {
  const users = await getUsers();
  const idx = users.findIndex((u) => u.id === user.id);
  if (idx >= 0) users[idx] = { ...users[idx], ...user };
  else users.push(user);
  await writeUsers(users);
}

export async function patchUser(id, patch) {
  const users = await getUsers();
  const idx = users.findIndex((u) => u.id === id);
  if (idx < 0) return null;
  users[idx] = { ...users[idx], ...patch };
  await writeUsers(users);
  return users[idx];
}

export async function deleteUser(id) {
  const users = await getUsers();
  const next = users.filter((u) => u.id !== id);
  await writeUsers(next);
  return next.length !== users.length;
}

export function publicUser(u) {
  if (!u) return null;
  // Strip credentials before returning to clients.
  const { passwordHash, ...rest } = u;
  return rest;
}

// ---------- Usage tracking ----------
// Stored as { totalTokens, totalConversations, byUser: { [id]: {tokens, conversations, lastActiveAt} }, daily: { [yyyy-mm-dd]: tokens } }

const DEFAULT_USAGE = { totalTokens: 0, totalConversations: 0, byUser: {}, daily: {} };

export async function getUsage() {
  const s = store();
  const raw = await s.get(USAGE_KEY);
  return raw ? { ...DEFAULT_USAGE, ...raw } : { ...DEFAULT_USAGE };
}

export async function recordUsage({ userId, tokens = 0, conversation = false }) {
  const usage = await getUsage();
  const day = new Date().toISOString().slice(0, 10);
  usage.totalTokens = (usage.totalTokens || 0) + tokens;
  if (conversation) usage.totalConversations = (usage.totalConversations || 0) + 1;
  if (userId) {
    const u = usage.byUser[userId] || { tokens: 0, conversations: 0, lastActiveAt: null };
    u.tokens += tokens;
    if (conversation) u.conversations += 1;
    u.lastActiveAt = new Date().toISOString();
    usage.byUser[userId] = u;
  }
  usage.daily[day] = (usage.daily[day] || 0) + tokens;
  await store().setJSON(USAGE_KEY, usage);
  return usage;
}

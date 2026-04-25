// Per-user client state: selected model, web-search toggle, theme, conversation list.
// Auth, models, prompts and OCR config are server-managed and merged in at runtime.
import { uid, loadLocal, saveLocal } from './lib/utils.js';

const DEFAULT_USER_STATE = {
  selectedModelId: null,
  webSearchEnabled: false,
  theme: 'auto',
  language: 'zh-CN',
  conversations: {},
  conversationOrder: [],
  activeConversationId: null,
};

export function loadUserState(userId) {
  const all = loadLocal() || {};
  const u = (all.users && all.users[userId]) || null;
  return { ...DEFAULT_USER_STATE, ...(u || {}) };
}

export function saveUserState(userId, state) {
  if (!userId) return;
  const all = loadLocal() || {};
  all.users = all.users || {};
  // Strip transient fields like streaming flags before persisting.
  const conversations = {};
  for (const [id, c] of Object.entries(state.conversations || {})) {
    conversations[id] = {
      ...c,
      messages: (c.messages || []).map((m) => ({
        ...m,
        streaming: false,
      })),
    };
  }
  all.users[userId] = {
    selectedModelId: state.selectedModelId,
    webSearchEnabled: !!state.webSearchEnabled,
    theme: state.theme,
    language: state.language,
    conversations,
    conversationOrder: state.conversationOrder || [],
    activeConversationId: state.activeConversationId || null,
  };
  saveLocal(all);
}

export function loadGlobalPrefs() {
  const all = loadLocal() || {};
  return all.global || {};
}

export function saveGlobalPrefs(patch) {
  const all = loadLocal() || {};
  all.global = { ...(all.global || {}), ...patch };
  saveLocal(all);
}

export function reducer(state, action) {
  switch (action.type) {
    case 'set':
      return { ...state, [action.key]: action.value };
    case 'setTheme':
      return { ...state, theme: action.theme };
    case 'toggleWebSearch':
      return { ...state, webSearchEnabled: !state.webSearchEnabled };

    case 'newConversation': {
      const id = uid('conv');
      const conv = { id, title: '新对话', messages: [], createdAt: Date.now(), pinned: false };
      return {
        ...state,
        conversations: { ...state.conversations, [id]: conv },
        conversationOrder: [id, ...state.conversationOrder],
        activeConversationId: id,
      };
    }
    case 'createConversation': {
      const conv = { id: action.id, title: action.title, messages: [], createdAt: Date.now(), pinned: false };
      return {
        ...state,
        conversations: { ...state.conversations, [action.id]: conv },
        conversationOrder: [action.id, ...state.conversationOrder.filter((x) => x !== action.id)],
        activeConversationId: action.id,
      };
    }
    case 'selectConversation':
      return { ...state, activeConversationId: action.id };
    case 'renameConversation': {
      const c = state.conversations[action.id];
      if (!c) return state;
      return {
        ...state,
        conversations: { ...state.conversations, [action.id]: { ...c, title: action.title || '新对话' } },
      };
    }
    case 'pinConversation': {
      const c = state.conversations[action.id];
      if (!c) return state;
      return {
        ...state,
        conversations: { ...state.conversations, [action.id]: { ...c, pinned: !c.pinned } },
      };
    }
    case 'deleteConversation': {
      const next = { ...state.conversations };
      delete next[action.id];
      return {
        ...state,
        conversations: next,
        conversationOrder: state.conversationOrder.filter((x) => x !== action.id),
        activeConversationId:
          state.activeConversationId === action.id ? null : state.activeConversationId,
      };
    }
    case 'clearConversations':
      return { ...state, conversations: {}, conversationOrder: [], activeConversationId: null };

    case 'addMessages': {
      const c = state.conversations[action.convId];
      if (!c) return state;
      const next = { ...c, messages: [...c.messages, ...action.messages] };
      if (c.title === '新对话' && action.messages[0]?.role === 'user' && action.messages[0].content) {
        const text = typeof action.messages[0].content === 'string'
          ? action.messages[0].content
          : '新对话';
        next.title = text.slice(0, 24);
      }
      return { ...state, conversations: { ...state.conversations, [action.convId]: next } };
    }
    case 'patchMessage': {
      const c = state.conversations[action.convId];
      if (!c) return state;
      const messages = c.messages.map((m) => (m.id === action.msgId ? { ...m, ...action.patch } : m));
      return { ...state, conversations: { ...state.conversations, [action.convId]: { ...c, messages } } };
    }
    case 'addAgentStep': {
      const c = state.conversations[action.convId];
      if (!c) return state;
      const messages = c.messages.map((m) =>
        m.id === action.msgId ? { ...m, agentSteps: [...(m.agentSteps || []), action.step] } : m
      );
      return { ...state, conversations: { ...state.conversations, [action.convId]: { ...c, messages } } };
    }
    case 'updateAgentStep': {
      const c = state.conversations[action.convId];
      if (!c) return state;
      const messages = c.messages.map((m) =>
        m.id === action.msgId
          ? {
              ...m,
              agentSteps: (m.agentSteps || []).map((s) =>
                s.id === action.id ? { ...s, ...action.patch } : s
              ),
            }
          : m
      );
      return { ...state, conversations: { ...state.conversations, [action.convId]: { ...c, messages } } };
    }

    case 'replaceState':
      return action.state;

    default:
      return state;
  }
}

export { DEFAULT_USER_STATE };

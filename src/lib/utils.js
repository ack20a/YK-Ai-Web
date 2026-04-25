// Shared client utilities: id, persistence, theme, light markdown, formatting.

const STORAGE_KEY = 'yk-ai-web/v1';
const TOKEN_KEY = 'yk-ai-web/token';

export function uid(prefix = 'id') {
  return `${prefix}_${Math.random().toString(36).slice(2, 9)}${Date.now().toString(36).slice(-3)}`;
}

export function classNames(...args) {
  return args.filter(Boolean).join(' ');
}

export function loadLocal() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function saveLocal(state) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* noop */
  }
}

export function loadToken() {
  try {
    return localStorage.getItem(TOKEN_KEY) || null;
  } catch {
    return null;
  }
}

export function saveToken(token) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* noop */
  }
}

export function applyTheme(theme) {
  const root = document.documentElement;
  let active = theme;
  if (theme === 'auto') {
    active = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  root.setAttribute('data-theme', active);
}

// Subset markdown -> HTML with HTML escaping. Renders streamed assistant text only.
export function renderMarkdown(text) {
  if (!text) return '';
  let html = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  html = html.replace(/```(\w+)?\n?([\s\S]*?)```/g, (_, _lang, code) => `<pre><code>${code.trimEnd()}</code></pre>`);

  html = html
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^# (.+)$/gm, '<h1>$1</h1>');

  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/`([^`\n]+)`/g, '<code>$1</code>');

  // Auto-link bare URLs (http/https). Must not double-link existing href= or markdown.
  html = html.replace(/(^|[\s(])((?:https?):\/\/[^\s<)]+)(?=$|[\s)])/g, (_, lead, url) => {
    return `${lead}<a href="${url}" target="_blank" rel="noopener noreferrer">${url}</a>`;
  });

  html = html.replace(/(^|\n)((?:- .+(?:\n- .+)*))/g, (_, lead, block) => {
    const items = block
      .split('\n')
      .map((l) => l.replace(/^- /, '').trim())
      .map((t) => `<li>${t}</li>`)
      .join('');
    return `${lead}<ul>${items}</ul>`;
  });
  html = html.replace(/(^|\n)((?:\d+\. .+(?:\n\d+\. .+)*))/g, (_, lead, block) => {
    const items = block
      .split('\n')
      .map((l) => l.replace(/^\d+\. /, '').trim())
      .map((t) => `<li>${t}</li>`)
      .join('');
    return `${lead}<ol>${items}</ol>`;
  });

  return html;
}

// Parse streaming buffer for <think>/<thinking> wrappers.
export function parseStream(buffer) {
  if (!buffer) return { thinking: '', content: '', isThinking: false, hasThinking: false };
  const m = buffer.match(/^<(thinking|think)>([\s\S]*?)(<\/(thinking|think)>([\s\S]*))?$/);
  if (!m) return { thinking: '', content: buffer, isThinking: false, hasThinking: false };
  const inside = m[2];
  const after = m[5];
  if (after === undefined) {
    return { thinking: inside, content: '', isThinking: true, hasThinking: true };
  }
  return { thinking: inside.trim(), content: after.trim(), isThinking: false, hasThinking: true };
}

export function tokenEstimate(text) {
  if (!text) return 0;
  return Math.max(1, Math.round(text.length / 1.6));
}

export function fmtTokens(n) {
  if (!Number.isFinite(n)) return '0';
  if (n < 1000) return String(n);
  if (n < 1_000_000) return (n / 1000).toFixed(1) + 'K';
  return (n / 1_000_000).toFixed(2) + 'M';
}

export function fmtRelative(ts) {
  if (!ts) return '—';
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return '—';
  const diff = (Date.now() - d.getTime()) / 1000;
  if (diff < 60) return '刚刚';
  if (diff < 3600) return `${Math.floor(diff / 60)} 分钟前`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} 小时前`;
  if (diff < 604800) return `${Math.floor(diff / 86400)} 天前`;
  return d.toLocaleDateString('zh-CN');
}

export function fmtDate(ts) {
  if (!ts) return '—';
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('zh-CN');
}

// Shared client utilities: id, persistence, theme, light markdown, formatting.
import katex from 'katex';

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

const INLINE_TOKEN = '\u0000yk-md-token-';

function renderMath(tex, displayMode = false) {
  const source = String(tex || '').trim();
  if (!source) return '';
  try {
    return katex.renderToString(source, {
      displayMode,
      throwOnError: false,
      strict: false,
      trust: false,
      output: 'html',
    });
  } catch {
    return `<code>${escapeHtml(source)}</code>`;
  }
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function escapeAttr(value) {
  return escapeHtml(value).replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function sanitizeUrl(url) {
  const value = String(url || '').trim().replace(/^<|>$/g, '');
  if (!value || /[\u0000-\u001F\u007F\s]/.test(value)) return '';

  if (/^(#|\/(?!\/)|\.\/|\.\.\/)/.test(value)) return value;
  if (/^[a-z][a-z\d+.-]*:/i.test(value)) {
    try {
      const parsed = new URL(value);
      return /^(https?:|mailto:)$/i.test(parsed.protocol) ? value : '';
    } catch {
      return '';
    }
  }

  return '';
}

function renderLink(url, label, title) {
  const href = sanitizeUrl(url);
  if (!href) return escapeHtml(label || url || '');
  const safeTitle = title ? ` title="${escapeAttr(title)}"` : '';
  return `<a href="${escapeAttr(href)}" target="_blank" rel="noopener noreferrer"${safeTitle}>${renderInline(label || href)}</a>`;
}

function autoLink(html) {
  return html.replace(/(^|[\s(])((?:https?):\/\/[^\s<"']+)(?=$|[\s)])/g, (_, lead, rawUrl) => {
    let url = rawUrl;
    let trailing = '';
    while (/[.,!?;:]$/.test(url)) {
      trailing = url.slice(-1) + trailing;
      url = url.slice(0, -1);
    }
    return `${lead}<a href="${url}" target="_blank" rel="noopener noreferrer">${url}</a>${trailing}`;
  });
}

function renderInline(text) {
  const tokens = [];
  const stash = (html) => {
    tokens.push(html);
    return `${INLINE_TOKEN}${tokens.length - 1}\u0000`;
  };

  let source = String(text || '');
  source = source.replace(/`([^`\n]+)`/g, (_, code) => stash(`<code>${escapeHtml(code)}</code>`));
  source = source.replace(/(\\{1,2})\(([\s\S]+?)\1\)/g, (_, _slash, tex) => stash(renderMath(tex, false)));
  source = source.replace(/(^|[^\\$])\$([^$\n]+?)\$(?!\$)/g, (_, lead, tex) => `${lead}${stash(renderMath(tex, false))}`);
  source = source.replace(
    /\[([^\]\n]+)\]\((<?[^\s)>]+>?)(?:\s+["']([^"']*)["'])?\)/g,
    (_, label, url, title) => stash(renderLink(url, label, title))
  );

  let html = escapeHtml(source).replace(/&lt;br\s*\/?&gt;/gi, '<br />');
  html = html
    .replace(/(\*\*|__)([\s\S]+?)\1/g, '<strong>$2</strong>')
    .replace(/~~([\s\S]+?)~~/g, '<del>$1</del>')
    .replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, '$1<em>$2</em>')
    .replace(/(^|[^\w_])_([^_\n]+)_(?![\w_])/g, '$1<em>$2</em>');
  html = autoLink(html);

  return html.replace(new RegExp(`${INLINE_TOKEN}(\\d+)\\u0000`, 'g'), (_, index) => tokens[Number(index)] || '');
}

function renderInlineWithBreaks(text) {
  return renderInline(text).replace(/\n/g, '<br />');
}

function isFenceStart(line) {
  return line.match(/^\s*(```+|~~~+)\s*([\w-]+)?\s*$/);
}

function isListLine(line) {
  return /^\s{0,3}(?:[-*+]\s+|\d+[.)]\s+)/.test(line);
}

function isRule(line) {
  return /^\s{0,3}([-*_])(?:\s*\1){2,}\s*$/.test(line);
}

function isDisplayMathStart(line) {
  return !!getDisplayMathDelimiters(line);
}

function getDisplayMathDelimiters(line) {
  const trimmed = line.trim();
  if (trimmed.startsWith('$$')) return { open: '$$', close: '$$' };
  if (trimmed.startsWith('\\\\[')) return { open: '\\\\[', close: '\\\\]' };
  if (trimmed.startsWith('\\[')) return { open: '\\[', close: '\\]' };
  return null;
}

function splitTableRow(line) {
  const trimmed = line.trim().replace(/^\|/, '').replace(/\|$/, '');
  const cells = [];
  let current = '';

  for (let index = 0; index < trimmed.length; index += 1) {
    const char = trimmed[index];
    if (char === '\\' && trimmed[index + 1] === '|') {
      current += '|';
      index += 1;
    } else if (char === '|') {
      cells.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }

  cells.push(current.trim());
  return cells;
}

function isTableSeparator(line) {
  const cells = splitTableRow(line);
  return cells.length > 0 && cells.every((cell) => /^:?-{3,}:?$/.test(cell.trim()));
}

function isTableStart(lines, index) {
  return lines[index]?.includes('|') && lines[index + 1] && isTableSeparator(lines[index + 1]);
}

function tableAlign(cell) {
  const value = cell.trim();
  if (value.startsWith(':') && value.endsWith(':')) return 'center';
  if (value.endsWith(':')) return 'right';
  if (value.startsWith(':')) return 'left';
  return '';
}

function renderTable(lines, start) {
  const headers = splitTableRow(lines[start]);
  const aligns = splitTableRow(lines[start + 1]).map(tableAlign);
  const rows = [];
  let index = start + 2;

  while (index < lines.length && lines[index].trim() && lines[index].includes('|')) {
    rows.push(splitTableRow(lines[index]));
    index += 1;
  }

  const renderCell = (tag, cell, cellIndex) => {
    const align = aligns[cellIndex] ? ` style="text-align: ${aligns[cellIndex]}"` : '';
    return `<${tag}${align}>${renderInline(cell || '')}</${tag}>`;
  };

  const head = headers.map((cell, cellIndex) => renderCell('th', cell, cellIndex)).join('');
  const body = rows
    .map((row) => {
      const cells = headers.map((_, cellIndex) => renderCell('td', row[cellIndex] || '', cellIndex)).join('');
      return `<tr>${cells}</tr>`;
    })
    .join('');

  return {
    html: `<div class="markdown-table-wrap"><table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`,
    next: index,
  };
}

function renderCodeBlock(lines, start) {
  const match = isFenceStart(lines[start]);
  const fence = match[1][0];
  const size = match[1].length;
  const lang = match[2] || '';
  const code = [];
  let index = start + 1;

  while (index < lines.length) {
    const closing = lines[index].match(/^\s*(```+|~~~+)\s*$/);
    if (closing && closing[1][0] === fence && closing[1].length >= size) {
      index += 1;
      break;
    }
    code.push(lines[index]);
    index += 1;
  }

  const safeLang = lang.replace(/[^\w-]/g, '');
  const languageAttr = safeLang ? ` data-language="${escapeAttr(safeLang)}"` : '';
  const classAttr = safeLang ? ` class="language-${escapeAttr(safeLang)}"` : '';
  return {
    html: `<pre${languageAttr}><code${classAttr}>${escapeHtml(code.join('\n')).trimEnd()}</code></pre>`,
    next: index,
  };
}

function renderDisplayMath(lines, start) {
  const trimmed = lines[start].trim();
  const delimiters = getDisplayMathDelimiters(lines[start]);
  const { open, close } = delimiters || { open: '$$', close: '$$' };
  const first = trimmed.slice(open.length);
  const math = [];

  if (first.includes(close)) {
    math.push(first.slice(0, first.indexOf(close)));
    return { html: `<div class="math-display">${renderMath(math.join('\n'), true)}</div>`, next: start + 1 };
  }

  if (first) math.push(first);
  let index = start + 1;
  while (index < lines.length) {
    const line = lines[index];
    const closeIndex = line.indexOf(close);
    if (closeIndex !== -1) {
      math.push(line.slice(0, closeIndex));
      index += 1;
      break;
    }
    math.push(line);
    index += 1;
  }

  return { html: `<div class="math-display">${renderMath(math.join('\n'), true)}</div>`, next: index };
}

function renderList(lines, start) {
  const ordered = /^\s{0,3}\d+[.)]\s+/.test(lines[start]);
  const pattern = ordered ? /^\s{0,3}\d+[.)]\s+(.+)$/ : /^\s{0,3}[-*+]\s+(.+)$/;
  const items = [];
  let hasTask = false;
  let index = start;

  while (index < lines.length) {
    const match = lines[index].match(pattern);
    if (!match) break;

    const itemLines = [match[1]];
    index += 1;

    while (index < lines.length && lines[index].trim() && !isListLine(lines[index])) {
      if (!/^\s{2,}/.test(lines[index])) break;
      itemLines.push(lines[index].trim());
      index += 1;
    }

    let body = itemLines.join('\n');
    const task = body.match(/^\[( |x|X)\]\s+([\s\S]*)$/);
    if (task) {
      hasTask = true;
      const checked = task[1].toLowerCase() === 'x' ? ' checked' : '';
      body = `<input type="checkbox" disabled${checked} />${renderInlineWithBreaks(task[2])}`;
    } else {
      body = renderInlineWithBreaks(body);
    }
    items.push(`<li>${body}</li>`);
  }

  const tag = ordered ? 'ol' : 'ul';
  const classAttr = hasTask ? ' class="task-list"' : '';
  return { html: `<${tag}${classAttr}>${items.join('')}</${tag}>`, next: index };
}

function startsBlock(lines, index) {
  const line = lines[index] || '';
  return (
    !line.trim() ||
    isFenceStart(line) ||
    isDisplayMathStart(line) ||
    /^\s{0,3}#{1,6}\s+/.test(line) ||
    isRule(line) ||
    /^\s{0,3}>/.test(line) ||
    isListLine(line) ||
    isTableStart(lines, index)
  );
}

function renderBlocks(lines) {
  const parts = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];
    if (!line.trim()) {
      index += 1;
      continue;
    }

    if (isFenceStart(line)) {
      const block = renderCodeBlock(lines, index);
      parts.push(block.html);
      index = block.next;
      continue;
    }

    if (isDisplayMathStart(line)) {
      const block = renderDisplayMath(lines, index);
      parts.push(block.html);
      index = block.next;
      continue;
    }

    const heading = line.match(/^\s{0,3}(#{1,6})\s+(.+)$/);
    if (heading) {
      const level = heading[1].length;
      parts.push(`<h${level}>${renderInline(heading[2].replace(/\s+#+\s*$/, ''))}</h${level}>`);
      index += 1;
      continue;
    }

    if (isRule(line)) {
      parts.push('<hr />');
      index += 1;
      continue;
    }

    if (/^\s{0,3}>/.test(line)) {
      const quoted = [];
      while (index < lines.length && /^\s{0,3}>/.test(lines[index])) {
        quoted.push(lines[index].replace(/^\s{0,3}> ?/, ''));
        index += 1;
      }
      parts.push(`<blockquote>${renderBlocks(quoted)}</blockquote>`);
      continue;
    }

    if (isTableStart(lines, index)) {
      const table = renderTable(lines, index);
      parts.push(table.html);
      index = table.next;
      continue;
    }

    if (isListLine(line)) {
      const list = renderList(lines, index);
      parts.push(list.html);
      index = list.next;
      continue;
    }

    const paragraph = [];
    while (index < lines.length && lines[index].trim() && !startsBlock(lines, index)) {
      paragraph.push(lines[index]);
      index += 1;
    }
    parts.push(`<p>${renderInlineWithBreaks(paragraph.join('\n'))}</p>`);
  }

  return parts.join('');
}

// Safe subset markdown -> HTML. Renders streamed assistant text only.
export function renderMarkdown(text) {
  if (!text) return '';
  return renderBlocks(String(text).replace(/\r\n?/g, '\n').split('\n'));
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

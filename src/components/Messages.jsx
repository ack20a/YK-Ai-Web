import React, { useEffect, useState } from 'react';
import * as I from '../icons.jsx';
import { classNames, parseStream, renderMarkdown, renderMarkdownAsync, fmtTokens } from '../lib/utils.js';

function ImageLightbox({ src, onClose }) {
  useEffect(() => {
    if (!src) return undefined;
    const onKeyDown = (e) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [src, onClose]);

  if (!src) return null;
  return (
    <div className="image-lightbox" onClick={onClose}>
      <button className="image-lightbox-close" onClick={onClose} title="关闭预览">
        <I.X size={18} />
      </button>
      <img src={src} alt="图片预览" onClick={(e) => e.stopPropagation()} />
    </div>
  );
}

export function ThinkingBlock({ thinking, isThinking, durationMs }) {
  const [expanded, setExpanded] = useState(false);
  const seconds = (durationMs || 0) / 1000;
  const label = isThinking
    ? '正在思考…'
    : `已思考 ${seconds < 1 ? seconds.toFixed(1) : Math.round(seconds)} 秒`;
  return (
    <div className="thinking-block">
      <button
        className={classNames('thinking-pill', isThinking && 'thinking', expanded && 'expanded')}
        onClick={() => setExpanded((e) => !e)}
      >
        {isThinking ? <span className="spinner" /> : <I.Brain size={13} />}
        <span>{label}</span>
        <I.ChevronDown size={13} className="chevron" />
      </button>
      {expanded && thinking && <div className="thinking-content">{thinking}</div>}
    </div>
  );
}

export function AgentStep({ step }) {
  const [expanded, setExpanded] = useState(false);
  const isSearch = step.kind === 'search';
  const isFetch = step.kind === 'fetch';
  const isOcr = step.kind === 'ocr';
  const isPlan = step.kind === 'plan';
  const isReview = step.kind === 'review';
  const fetchSource = step.source === 'tavily' ? 'Tavily' : 'r.jina.ai';
  const roundPrefix = step.round ? `第 ${step.round} 轮 · ` : '';

  const icon = isSearch ? (
    <I.Search size={14} />
  ) : isFetch ? (
    <I.Link size={14} />
  ) : isOcr ? (
    <I.Eye size={14} />
  ) : isPlan || isReview ? (
    <I.Brain size={14} />
  ) : (
    <I.Sparkle size={14} />
  );

  const title = isPlan
    ? step.status === 'running'
      ? step.title || '正在规划搜索…'
      : step.searchNeeded === false
      ? '无需继续搜索'
      : `已规划第 ${step.round || 1} 轮搜索`
    : isReview
    ? step.status === 'running'
      ? step.title || '正在评估搜索资料…'
      : `已评估第 ${step.round || 1} 轮资料`
    : isSearch
    ? step.status === 'running'
      ? '正在搜索…'
      : step.status === 'error'
      ? '搜索失败'
      : `已检索 ${step.count || 0} 条结果`
    : isFetch
    ? step.status === 'running'
      ? `正在通过 ${fetchSource} 抓取 ${step.count || 0} 个网页…`
      : step.status === 'error'
      ? '抓取失败'
      : `已通过 ${fetchSource} 获取 ${step.count || 0} 个网页正文`
    : isOcr
    ? step.status === 'running'
      ? `正在调用「${step.model || 'OCR'}」识别图像…`
      : step.status === 'error'
      ? '图像识别失败'
      : '已识别图像内容'
    : step.title;

  const meta = isPlan
    ? step.queries?.length
      ? `搜索词：${step.queries.join(' / ')}`
      : step.reason || null
    : isReview
    ? step.needMore && step.nextQueries?.length
      ? `继续搜索：${step.nextQueries.join(' / ')}`
      : `${step.relevantIds?.length || 0} 条相关资料`
    : isSearch && step.query
    ? `${roundPrefix}Tavily · "${step.query.slice(0, 40)}"`
    : isFetch
    ? step.source === 'tavily'
      ? `${roundPrefix}Tavily raw_content`
      : `${roundPrefix}r.jina.ai 代理`
    : isOcr && step.model
    ? `${step.model} · 多模态备援`
    : null;

  const expandable =
    step.status === 'done' &&
    ((isSearch && step.results?.length) ||
      (isFetch && step.urls?.length) ||
      (isOcr && step.text) ||
      (isPlan && (step.reason || step.queries?.length || step.warning)) ||
      (isReview && (step.assessment || step.nextQueries?.length || step.warning)));

  return (
    <div
      className={classNames(
        'agent-step',
        step.status,
        expandable && 'expandable',
        expanded && 'expanded'
      )}
      onClick={() => expandable && setExpanded((e) => !e)}
    >
      <div className="agent-step-icon">
        {step.status === 'running' ? (
          <span
            className="spinner"
            style={{
              width: 12,
              height: 12,
              border: '1.5px solid var(--border-strong)',
              borderTopColor: 'var(--fg)',
              borderRadius: '50%',
              animation: 'spin 0.8s linear infinite',
            }}
          />
        ) : (
          icon
        )}
      </div>
      <div className="agent-step-body">
        <div className="agent-step-title">
          {title}
          {expandable && <I.ChevronDown size={12} className="agent-step-chevron" />}
        </div>
        {meta && <div className="agent-step-meta">{meta}</div>}
        {step.status === 'error' && step.error && (
          <div className="agent-step-meta" style={{ color: 'var(--danger)' }}>
            {step.error}
          </div>
        )}
        {expanded && isPlan && (
          <div className="agent-step-results">
            <div className="agent-step-result">
              {step.reason && <div className="agent-step-result-title">{step.reason}</div>}
              {step.queries?.length > 0 && (
                <div className="agent-step-result-url">{step.queries.join(' / ')}</div>
              )}
              {step.warning && (
                <div className="agent-step-result-url" style={{ color: 'var(--warning)' }}>
                  {step.warning}
                </div>
              )}
            </div>
          </div>
        )}
        {expanded && isReview && (
          <div className="agent-step-results">
            <div className="agent-step-result">
              {step.assessment && <div className="agent-step-result-title">{step.assessment}</div>}
              {step.relevantIds?.length > 0 && (
                <div className="agent-step-result-url">相关资料：{step.relevantIds.join(' / ')}</div>
              )}
              {step.nextQueries?.length > 0 && (
                <div className="agent-step-result-url">下一轮：{step.nextQueries.join(' / ')}</div>
              )}
              {step.warning && (
                <div className="agent-step-result-url" style={{ color: 'var(--warning)' }}>
                  {step.warning}
                </div>
              )}
            </div>
          </div>
        )}
        {expanded && isSearch && step.results && (
          <div className="agent-step-results">
            {step.results.map((r, i) => (
              <a
                key={i}
                href={r.url}
                target="_blank"
                rel="noopener noreferrer"
                className="agent-step-result"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="agent-step-result-title">{r.title || r.url}</div>
                <div className="agent-step-result-url">{r.url}</div>
              </a>
            ))}
          </div>
        )}
        {expanded && isFetch && step.urls && (
          <div className="agent-step-results">
            {step.urls.map((u, i) => (
              <a
                key={i}
                href={step.source === 'tavily' ? u : `https://r.jina.ai/${u}`}
                target="_blank"
                rel="noopener noreferrer"
                className="agent-step-result"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="agent-step-result-url">
                  {step.source === 'tavily' ? u : `https://r.jina.ai/${u}`}
                </div>
              </a>
            ))}
          </div>
        )}
        {expanded && isOcr && step.text && (
          <div className="agent-step-results">
            <div className="agent-step-result" style={{ whiteSpace: 'pre-wrap' }}>
              {step.text}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function MessageMeta({ msg, onRegenerate, onCopy, copied }) {
  const stats = msg.stats;
  return (
    <div className="message-meta">
      <div className="message-meta-actions">
        <button
          className={classNames('message-action-btn', copied && 'copied')}
          title={copied ? '已复制' : '复制'}
          onClick={onCopy}
        >
          {copied ? <I.Check size={14} /> : <I.Copy size={14} />}
        </button>
        <button className="message-action-btn" title="重新生成" onClick={onRegenerate}>
          <I.Refresh size={14} />
        </button>
      </div>
      {msg.ocrUsed && (
        <span className="ocr-badge" title="此模型不支持图像，已通过 OCR 模型转写">
          <I.Eye size={11} /> OCR · {msg.ocrUsed}
        </span>
      )}
      {stats && stats.completionTokens > 0 && (
        <>
          <span className="message-stat">{stats.tps.toFixed(1)} tok/s</span>
          <span className="message-stat-divider">·</span>
          <span className="message-stat">{fmtTokens(stats.completionTokens)} tokens</span>
          <span className="message-stat-divider">·</span>
          <span className="message-stat">{stats.elapsed.toFixed(1)}s</span>
        </>
      )}
    </div>
  );
}

export function UserMessage({ msg }) {
  const [previewSrc, setPreviewSrc] = useState(null);
  const text = typeof msg.content === 'string' ? msg.content : '';
  return (
    <div className="message-group">
      {msg.images && msg.images.length > 0 && (
        <div className="message-user-images">
          {msg.images.map((src, i) => (
            <button
              key={i}
              className="message-user-image"
              style={{ backgroundImage: `url(${src})` }}
              onClick={() => setPreviewSrc(src)}
              title="点击预览图片"
              aria-label={`预览第 ${i + 1} 张图片`}
            />
          ))}
        </div>
      )}
      {text && (
        <div className="message-user">
          <div className="message-user-bubble">{text}</div>
        </div>
      )}
      <ImageLightbox src={previewSrc} onClose={() => setPreviewSrc(null)} />
    </div>
  );
}

export function AssistantMessage({ msg, onRegenerate }) {
  const [copied, setCopied] = useState(false);
  const parsed = parseStream(msg.content || '');
  const [html, setHtml] = useState(() => ({ __html: renderMarkdown(parsed.content) }));

  useEffect(() => {
    let cancelled = false;
    renderMarkdownAsync(parsed.content).then((result) => {
      if (!cancelled) setHtml({ __html: result });
    });
    return () => { cancelled = true; };
  }, [parsed.content]);

  function copy() {
    const txt = parsed.content || msg.content || '';
    navigator.clipboard?.writeText(txt).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  return (
    <div className="message-group">
      <div className="message-assistant">
        {msg.agentSteps && msg.agentSteps.length > 0 && (
          <div className="agent-steps">
            {msg.agentSteps.map((s) => (
              <AgentStep key={s.id} step={s} />
            ))}
          </div>
        )}
        {parsed.hasThinking && (
          <ThinkingBlock
            thinking={parsed.thinking}
            isThinking={parsed.isThinking && msg.streaming}
            durationMs={msg.thinkingMs || 0}
          />
        )}
        <div className="message-assistant-content" dangerouslySetInnerHTML={html} />
        {msg.streaming && !parsed.isThinking && <span className="cursor" />}
        {!msg.streaming && (msg.stats || msg.ocrUsed) && (
          <MessageMeta msg={msg} onRegenerate={onRegenerate} onCopy={copy} copied={copied} />
        )}
        {msg.error && (
          <div style={{ color: 'var(--danger)', fontSize: 13, marginTop: 8 }}>出错了：{msg.error}</div>
        )}
      </div>
    </div>
  );
}

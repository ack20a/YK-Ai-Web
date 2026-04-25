import React, { useEffect, useRef, useState } from 'react';
import * as I from '../icons.jsx';
import { classNames, uid, parseStream, tokenEstimate } from '../lib/utils.js';
import { startChat } from '../lib/engine.js';
import { api } from '../lib/api.js';
import { UserMessage, AssistantMessage } from './Messages.jsx';
import Composer from './Composer.jsx';

export default function ChatView({
  state,
  dispatch,
  config,
  sidebarCollapsed,
  onToggleSidebar,
}) {
  const [modelMenuOpen, setModelMenuOpen] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const streamRef = useRef(null);
  const scrollRef = useRef(null);

  const conv = state.activeConversationId ? state.conversations[state.activeConversationId] : null;
  const messages = conv?.messages || [];
  const enabledModels = (config?.models || []).filter((m) => m.enabled);
  const currentModel =
    enabledModels.find((m) => m.id === state.selectedModelId) || enabledModels[0] || null;
  const ocrModel = config?.ocrModelId
    ? (config.models || []).find((m) => m.id === config.ocrModelId && m.vision)
    : null;

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages.length, messages[messages.length - 1]?.content]);

  useEffect(() => {
    function close(e) {
      if (!e.target.closest('.model-menu') && !e.target.closest('.model-selector')) setModelMenuOpen(false);
    }
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, []);

  // Make sure the user has a valid model selected once config arrives.
  useEffect(() => {
    if (currentModel && currentModel.id !== state.selectedModelId) {
      dispatch({ type: 'set', key: 'selectedModelId', value: currentModel.id });
    }
  }, [currentModel?.id]);

  function pickModel(id) {
    dispatch({ type: 'set', key: 'selectedModelId', value: id });
    setModelMenuOpen(false);
  }

  function reportUsage(stats, isNewConversation) {
    if (!stats || stats.aborted) return;
    const tokens = (stats.totalTokens || stats.completionTokens + stats.promptTokens) | 0;
    if (tokens <= 0 && !isNewConversation) return;
    api.reportUsage({ tokens, newConversation: !!isNewConversation }).catch(() => {});
  }

  function buildHistory(beforeIds = new Set()) {
    if (!conv) return [];
    return conv.messages
      .filter((m) => !beforeIds.has(m.id))
      .filter((m) => m.role === 'user' || (m.role === 'assistant' && !m.streaming && !m.error))
      .map((m) => {
        if (m.role === 'assistant') {
          const parsed = parseStream(m.content || '');
          return { role: 'assistant', content: parsed.content || m.content || '' };
        }
        const text = typeof m.content === 'string' ? m.content : '';
        return { role: 'user', content: text };
      });
  }

  function handleSend({ text, images }) {
    if (!currentModel) return;
    let convId = state.activeConversationId;
    let isNewConversation = false;
    if (!convId) {
      convId = uid('conv');
      const title = text.slice(0, 24) || '新对话';
      dispatch({ type: 'createConversation', id: convId, title });
      isNewConversation = true;
    }
    const userMsg = { id: uid('m'), role: 'user', content: text, images, ts: Date.now() };
    const assistantMsg = {
      id: uid('m'),
      role: 'assistant',
      content: '',
      streaming: true,
      modelId: currentModel.id,
      agentSteps: [],
      ts: Date.now(),
    };
    if (images?.length && !currentModel.vision && ocrModel) {
      assistantMsg.ocrUsed = ocrModel.name;
    }
    dispatch({ type: 'addMessages', convId, messages: [userMsg, assistantMsg] });
    setStreaming(true);
    const startTs = performance.now();
    const history = buildHistory();

    streamRef.current = startChat({
      prompt: text,
      images,
      history,
      model: currentModel,
      ocrModel,
      webSearchEnabled: state.webSearchEnabled,
      config,
      onChunk: (buffer) => {
        const parsed = parseStream(buffer);
        const thinkingMs = parsed.isThinking ? performance.now() - startTs : undefined;
        dispatch({
          type: 'patchMessage',
          convId,
          msgId: assistantMsg.id,
          patch: thinkingMs !== undefined ? { content: buffer, thinkingMs } : { content: buffer },
        });
      },
      onAgent: (evt) => {
        if (evt.type === 'add') {
          dispatch({ type: 'addAgentStep', convId, msgId: assistantMsg.id, step: evt.step });
        } else if (evt.type === 'update') {
          dispatch({
            type: 'updateAgentStep',
            convId,
            msgId: assistantMsg.id,
            id: evt.id,
            patch: evt.patch,
          });
        }
      },
      onDone: (stats) => {
        dispatch({
          type: 'patchMessage',
          convId,
          msgId: assistantMsg.id,
          patch: { streaming: false, stats },
        });
        setStreaming(false);
        streamRef.current = null;
        reportUsage(stats, isNewConversation);
      },
      onError: (e) => {
        dispatch({
          type: 'patchMessage',
          convId,
          msgId: assistantMsg.id,
          patch: { streaming: false, error: String(e?.message || e) },
        });
        setStreaming(false);
        streamRef.current = null;
      },
    });
  }

  function stop() {
    streamRef.current?.stop();
    if (state.activeConversationId) {
      const c = state.conversations[state.activeConversationId];
      const last = c?.messages?.[c.messages.length - 1];
      if (last && last.role === 'assistant' && last.streaming) {
        dispatch({
          type: 'patchMessage',
          convId: state.activeConversationId,
          msgId: last.id,
          patch: {
            streaming: false,
            stats: {
              tps: 0,
              completionTokens: tokenEstimate(last.content),
              promptTokens: 0,
              elapsed: 0,
            },
          },
        });
      }
    }
    setStreaming(false);
  }

  function regenerate(msg) {
    if (streaming || !currentModel) return;
    const list = conv?.messages || [];
    const idx = list.findIndex((m) => m.id === msg.id);
    const userMsg = list.slice(0, idx).reverse().find((m) => m.role === 'user');
    if (!userMsg) return;
    const skip = new Set(list.slice(idx).map((m) => m.id));
    skip.add(userMsg.id);
    const history = buildHistory(skip);

    dispatch({
      type: 'patchMessage',
      convId: conv.id,
      msgId: msg.id,
      patch: {
        content: '',
        streaming: true,
        agentSteps: [],
        stats: null,
        error: null,
        thinkingMs: 0,
      },
    });
    setStreaming(true);
    const startTs = performance.now();
    streamRef.current = startChat({
      prompt: typeof userMsg.content === 'string' ? userMsg.content : '',
      images: userMsg.images || [],
      history,
      model: currentModel,
      ocrModel,
      webSearchEnabled: state.webSearchEnabled,
      config,
      onChunk: (buffer) => {
        const parsed = parseStream(buffer);
        const thinkingMs = parsed.isThinking ? performance.now() - startTs : undefined;
        dispatch({
          type: 'patchMessage',
          convId: conv.id,
          msgId: msg.id,
          patch: thinkingMs !== undefined ? { content: buffer, thinkingMs } : { content: buffer },
        });
      },
      onAgent: (evt) => {
        if (evt.type === 'add') {
          dispatch({ type: 'addAgentStep', convId: conv.id, msgId: msg.id, step: evt.step });
        } else {
          dispatch({
            type: 'updateAgentStep',
            convId: conv.id,
            msgId: msg.id,
            id: evt.id,
            patch: evt.patch,
          });
        }
      },
      onDone: (stats) => {
        dispatch({
          type: 'patchMessage',
          convId: conv.id,
          msgId: msg.id,
          patch: { streaming: false, stats },
        });
        setStreaming(false);
        streamRef.current = null;
        reportUsage(stats, false);
      },
      onError: (e) => {
        dispatch({
          type: 'patchMessage',
          convId: conv.id,
          msgId: msg.id,
          patch: { streaming: false, error: String(e?.message || e) },
        });
        setStreaming(false);
      },
    });
  }

  return (
    <main className="main">
      <header className="topbar">
        <div className="topbar-left">
          {sidebarCollapsed && (
            <button className="icon-btn" onClick={onToggleSidebar} title="打开侧边栏">
              <I.Sidebar size={18} />
            </button>
          )}
          <button
            className="model-selector"
            onClick={() => setModelMenuOpen((o) => !o)}
            disabled={!enabledModels.length}
          >
            <span>{currentModel?.name || '尚无可用模型'}</span>
            <I.ChevronDown size={14} className="chevron" />
          </button>
          {modelMenuOpen && enabledModels.length > 0 && (
            <div className="model-menu">
              {enabledModels.map((m) => (
                <button key={m.id} className="model-menu-item" onClick={() => pickModel(m.id)}>
                  <div className="model-menu-item-info">
                    <div className="model-menu-item-name">
                      {m.name}
                      {m.vision && <span className="tag tag-vision">多模态</span>}
                      {m.reasoning && <span className="tag tag-reasoning">思考</span>}
                    </div>
                    {m.desc && <div className="model-menu-item-desc">{m.desc}</div>}
                  </div>
                  <span
                    className={classNames(
                      'model-menu-item-check',
                      m.id !== currentModel?.id && 'hidden'
                    )}
                  >
                    <I.Check size={16} />
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="topbar-right">
          {state.webSearchEnabled && (
            <span className="tag" style={{ marginRight: 4 }}>
              <I.Globe size={11} style={{ marginRight: 2 }} /> 搜索已开启
            </span>
          )}
          <button
            className="icon-btn"
            onClick={() => dispatch({ type: 'newConversation' })}
            title="新对话"
          >
            <I.Edit size={18} />
          </button>
        </div>
      </header>

      <div className="chat-area" ref={scrollRef}>
        {messages.length === 0 ? (
          <div className="empty-state">
            <div className="empty-logo">YK</div>
            <div className="empty-title">有什么可以帮你的？</div>
          </div>
        ) : (
          <div className="chat-content">
            {messages.map((m) =>
              m.role === 'user' ? (
                <UserMessage key={m.id} msg={m} />
              ) : (
                <AssistantMessage key={m.id} msg={m} onRegenerate={() => regenerate(m)} />
              )
            )}
          </div>
        )}
      </div>

      <Composer
        state={state}
        dispatch={dispatch}
        streaming={streaming}
        onSend={handleSend}
        onStop={stop}
        currentModel={currentModel}
        ocrModel={ocrModel}
      />
    </main>
  );
}

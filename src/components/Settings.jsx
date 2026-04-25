import React, { useState } from 'react';
import * as I from '../icons.jsx';
import { fmtDate } from '../lib/utils.js';

export default function Settings({ state, dispatch, me, onClose, onLogout }) {
  const [tab, setTab] = useState('general');
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal settings-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title">设置</div>
          <button className="icon-btn" onClick={onClose}>
            <I.X size={18} />
          </button>
        </div>
        <div className="settings-tabs">
          <button
            className={'settings-tab ' + (tab === 'general' ? 'active' : '')}
            onClick={() => setTab('general')}
          >
            通用
          </button>
          <button
            className={'settings-tab ' + (tab === 'search' ? 'active' : '')}
            onClick={() => setTab('search')}
          >
            搜索
          </button>
          <button
            className={'settings-tab ' + (tab === 'data' ? 'active' : '')}
            onClick={() => setTab('data')}
          >
            数据
          </button>
          <button
            className={'settings-tab ' + (tab === 'account' ? 'active' : '')}
            onClick={() => setTab('account')}
          >
            账户
          </button>
        </div>
        <div className="modal-body" style={{ paddingTop: 8 }}>
          {tab === 'general' && <GeneralTab state={state} dispatch={dispatch} />}
          {tab === 'search' && <SearchTab state={state} dispatch={dispatch} />}
          {tab === 'data' && <DataTab state={state} dispatch={dispatch} onClose={onClose} />}
          {tab === 'account' && <AccountTab me={me} onLogout={onLogout} />}
        </div>
      </div>
    </div>
  );
}

export function Row({ label, desc, children }) {
  return (
    <div className="settings-row">
      <div className="settings-row-info">
        <div className="settings-row-label">{label}</div>
        {desc && <div className="settings-row-desc">{desc}</div>}
      </div>
      <div className="settings-row-control">{children}</div>
    </div>
  );
}

export function Toggle({ on, onChange }) {
  return <div className={'toggle ' + (on ? 'on' : '')} onClick={() => onChange(!on)} />;
}

function GeneralTab({ state, dispatch }) {
  return (
    <div>
      <Row label="主题" desc="选择浅色、深色或跟随系统">
        <div className="theme-picker">
          {['light', 'dark', 'auto'].map((t) => (
            <button
              key={t}
              className={state.theme === t ? 'active' : ''}
              onClick={() => dispatch({ type: 'setTheme', theme: t })}
            >
              {t === 'light' ? '浅色' : t === 'dark' ? '深色' : '自动'}
            </button>
          ))}
        </div>
      </Row>
      <Row label="语言" desc="界面与默认回复语言">
        <select
          className="select"
          value={state.language}
          onChange={(e) => dispatch({ type: 'set', key: 'language', value: e.target.value })}
          style={{ width: 140 }}
        >
          <option value="zh-CN">简体中文</option>
        </select>
      </Row>
    </div>
  );
}

function SearchTab({ state, dispatch }) {
  return (
    <div>
      <Row label="启用网络搜索" desc="允许通过 Tavily 检索网页，并获取网页正文作为上下文">
        <Toggle on={state.webSearchEnabled} onChange={() => dispatch({ type: 'toggleWebSearch' })} />
      </Row>
      <div
        style={{
          marginTop: 8,
          padding: '12px 14px',
          background: 'var(--bg-elev)',
          borderRadius: 10,
          fontSize: 12,
          color: 'var(--fg-muted)',
          lineHeight: 1.6,
        }}
      >
        <strong>搜索能力说明</strong>
        <br />
        • 检索与正文：默认由 Tavily 返回搜索结果和网页正文
        <br />
        • 兼容模式：管理员可开启 <code style={{ fontFamily: 'var(--font-mono)' }}>r.jina.ai</code> 抓取正文
        <br />
        • 检索深度、结果数、抓取条数与 Jina 开关由管理员在控制台配置
      </div>
    </div>
  );
}

function DataTab({ state, dispatch, onClose }) {
  function clearAll() {
    if (confirm('确认清除所有对话？此操作无法撤销。')) {
      dispatch({ type: 'clearConversations' });
      onClose();
    }
  }
  const total = state.conversationOrder.length;
  return (
    <div>
      <Row label="对话历史" desc={`本机保存 ${total} 个对话`}>
        <button className="btn btn-secondary" onClick={clearAll}>
          清除全部
        </button>
      </Row>
      <Row label="导出对话" desc="将本机对话导出为 JSON 文件">
        <button
          className="btn btn-secondary"
          onClick={() => {
            const data = { conversations: state.conversations, order: state.conversationOrder };
            const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = `yk-ai-export-${Date.now()}.json`;
            a.click();
          }}
        >
          导出
        </button>
      </Row>
    </div>
  );
}

function AccountTab({ me, onLogout }) {
  if (!me) return null;
  return (
    <div>
      <Row label="账户" desc={me.email}>
        <span style={{ fontSize: 13, color: 'var(--fg-muted)' }}>
          {me.role === 'admin' ? '管理员' : '普通用户'}
        </span>
      </Row>
      <Row label="加入时间">
        <span style={{ fontSize: 13, color: 'var(--fg-muted)' }}>{fmtDate(me.createdAt)}</span>
      </Row>
      <Row label="退出登录">
        <button className="btn btn-secondary" onClick={onLogout}>
          退出
        </button>
      </Row>
    </div>
  );
}

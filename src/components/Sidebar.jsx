import React, { useEffect, useRef, useState } from 'react';
import * as I from '../icons.jsx';
import { classNames } from '../lib/utils.js';

export default function Sidebar({
  state,
  dispatch,
  me,
  collapsed,
  onToggle,
  onOpenSettings,
  onOpenAdmin,
  onLogout,
}) {
  const [menuFor, setMenuFor] = useState(null);
  const [editing, setEditing] = useState(null);

  useEffect(() => {
    function close(e) {
      if (!e.target.closest('.convo-menu') && !e.target.closest('.convo-item-menu-btn')) setMenuFor(null);
    }
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, []);

  const ordered = state.conversationOrder.map((id) => state.conversations[id]).filter(Boolean);
  const pinned = ordered.filter((c) => c.pinned);
  const recent = ordered.filter((c) => !c.pinned);

  function startEdit(c) {
    setMenuFor(null);
    setEditing(c.id);
    setTimeout(() => {
      const el = document.querySelector('.convo-item.editing .convo-item-title');
      if (el) {
        el.contentEditable = 'true';
        el.focus();
        const range = document.createRange();
        range.selectNodeContents(el);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
      }
    }, 0);
  }

  function commitEdit(id, title) {
    dispatch({ type: 'renameConversation', id, title: (title || '').trim() });
    setEditing(null);
  }

  function renderItem(c) {
    return (
      <div
        key={c.id}
        className={classNames(
          'convo-item',
          state.activeConversationId === c.id && 'active',
          editing === c.id && 'editing'
        )}
        onClick={() => editing !== c.id && dispatch({ type: 'selectConversation', id: c.id })}
      >
        {c.pinned && (
          <span className="convo-item-pin">
            <I.PinFilled size={12} />
          </span>
        )}
        <div
          className="convo-item-title"
          onBlur={(e) => editing === c.id && commitEdit(c.id, e.currentTarget.textContent)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              e.currentTarget.blur();
            }
          }}
        >
          {c.title}
        </div>
        <button
          className="convo-item-menu-btn"
          onClick={(e) => {
            e.stopPropagation();
            setMenuFor(menuFor === c.id ? null : c.id);
          }}
        >
          <I.More size={16} />
        </button>
        {menuFor === c.id && (
          <div className="convo-menu" onClick={(e) => e.stopPropagation()}>
            <button
              className="convo-menu-item"
              onClick={() => {
                dispatch({ type: 'pinConversation', id: c.id });
                setMenuFor(null);
              }}
            >
              <I.Pin size={14} /> {c.pinned ? '取消置顶' : '置顶'}
            </button>
            <button className="convo-menu-item" onClick={() => startEdit(c)}>
              <I.Edit size={14} /> 重命名
            </button>
            <button
              className="convo-menu-item danger"
              onClick={() => {
                dispatch({ type: 'deleteConversation', id: c.id });
                setMenuFor(null);
              }}
            >
              <I.Trash size={14} /> 删除
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <aside className={classNames('sidebar', collapsed && 'collapsed')}>
      <div className="sidebar-inner">
        <div className="sidebar-header">
          <div className="sidebar-brand">
            <div className="sidebar-brand-mark">YK</div>
            YK AI
          </div>
          <div className="sidebar-actions">
            <button className="icon-btn" onClick={onToggle} title="折叠侧边栏">
              <I.Sidebar size={18} />
            </button>
            <button className="icon-btn" onClick={() => dispatch({ type: 'newConversation' })} title="新对话">
              <I.Edit size={18} />
            </button>
          </div>
        </div>

        <button className="new-chat-btn" onClick={() => dispatch({ type: 'newConversation' })}>
          <I.Plus size={16} /> 新对话
        </button>

        <div className="convo-list">
          {pinned.length > 0 && (
            <>
              <div className="sidebar-section-label">置顶</div>
              {pinned.map(renderItem)}
            </>
          )}
          {recent.length > 0 && (
            <>
              <div className="sidebar-section-label">最近</div>
              {recent.map(renderItem)}
            </>
          )}
          {ordered.length === 0 && (
            <div style={{ padding: '20px 14px', fontSize: 13, color: 'var(--fg-faint)', textAlign: 'center' }}>
              还没有对话
              <br />
              点击「新对话」开始
            </div>
          )}
        </div>

        <div className="sidebar-footer">
          <UserMenu me={me} onOpenSettings={onOpenSettings} onOpenAdmin={onOpenAdmin} onLogout={onLogout} />
        </div>
      </div>
    </aside>
  );
}

function UserMenu({ me, onOpenSettings, onOpenAdmin, onLogout }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    function close(e) {
      if (!ref.current) return;
      if (!ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, []);
  if (!me) return null;
  const initials = (me.name || me.email).slice(0, 1).toUpperCase();
  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button className="user-tile" onClick={() => setOpen((o) => !o)}>
        <div className={'user-avatar ' + (me.role === 'admin' ? 'admin' : '')}>{initials}</div>
        <div className="user-name">{me.name || me.email}</div>
        {me.role === 'admin' && <span className="user-role-badge">管理员</span>}
      </button>
      {open && (
        <div
          className="convo-menu"
          style={{ bottom: 'calc(100% + 4px)', right: 8, top: 'auto', left: 8 }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            className="convo-menu-item"
            onClick={() => {
              setOpen(false);
              onOpenSettings();
            }}
          >
            <I.Settings size={14} /> 设置
          </button>
          {me.role === 'admin' && (
            <button
              className="convo-menu-item"
              onClick={() => {
                setOpen(false);
                onOpenAdmin();
              }}
            >
              <I.Shield size={14} /> 管理员控制台
            </button>
          )}
          <div style={{ height: 1, background: 'var(--border)', margin: '4px 0' }} />
          <button
            className="convo-menu-item"
            onClick={() => {
              setOpen(false);
              onLogout();
            }}
          >
            <I.Logout size={14} /> 退出登录
          </button>
        </div>
      )}
    </div>
  );
}

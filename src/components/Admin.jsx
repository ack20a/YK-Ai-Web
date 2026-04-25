import React, { useEffect, useMemo, useState } from 'react';
import * as I from '../icons.jsx';
import { api } from '../lib/api.js';
import { fmtTokens, fmtRelative, fmtDate } from '../lib/utils.js';
import { Row, Toggle } from './Settings.jsx';

const TABS = [
  { key: 'stats', icon: I.BarChart, label: '使用统计' },
  { key: 'models', icon: I.Cube, label: '模型管理' },
  { key: 'users', icon: I.Users, label: '用户管理' },
  { key: 'prompts', icon: I.FileText, label: '系统提示词' },
  { key: 'ocr', icon: I.Eye, label: 'OCR 模型' },
  { key: 'search', icon: I.Globe, label: '搜索（Tavily）' },
];

export default function Admin({ config, refreshConfig, me, onExit }) {
  const [tab, setTab] = useState('stats');
  return (
    <div className="admin-page">
      <div className="admin-topbar">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div className="sidebar-brand-mark" style={{ width: 32, height: 32, fontSize: 13 }}>
            YK
          </div>
          <div>
            <div className="admin-title">管理员控制台</div>
            <div style={{ fontSize: 12, color: 'var(--fg-muted)' }}>YK AI · 私有部署</div>
          </div>
        </div>
        <button className="btn btn-secondary" onClick={onExit}>
          <I.ChevronRight size={14} style={{ transform: 'rotate(180deg)' }} /> 返回对话
        </button>
      </div>
      <div className="admin-layout">
        <nav className="admin-nav">
          {TABS.map(({ key, icon: Icon, label }) => (
            <button
              key={key}
              className={'admin-nav-item ' + (tab === key ? 'active' : '')}
              onClick={() => setTab(key)}
            >
              <Icon size={16} />
              <span>{label}</span>
            </button>
          ))}
        </nav>
        <div className="admin-content">
          {tab === 'stats' && <StatsPanel config={config} />}
          {tab === 'models' && <ModelsPanel config={config} refreshConfig={refreshConfig} />}
          {tab === 'users' && <UsersPanel me={me} />}
          {tab === 'prompts' && <PromptsPanel config={config} refreshConfig={refreshConfig} />}
          {tab === 'ocr' && <OcrPanel config={config} refreshConfig={refreshConfig} />}
          {tab === 'search' && <SearchSettingsPanel config={config} refreshConfig={refreshConfig} />}
        </div>
      </div>
    </div>
  );
}

function StatsPanel({ config }) {
  const [data, setData] = useState({ usage: null, users: [] });
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');

  useEffect(() => {
    let cancel = false;
    setLoading(true);
    api
      .getUsage()
      .then((d) => {
        if (cancel) return;
        setData(d);
        setLoading(false);
      })
      .catch((e) => {
        if (cancel) return;
        setErr(e.message || '加载失败');
        setLoading(false);
      });
    return () => {
      cancel = true;
    };
  }, []);

  const totalUsers = data.users.length;
  const activeUsers = data.users.filter((u) => u.enabled).length;
  const usage = data.usage || { totalTokens: 0, totalConversations: 0, byUser: {}, daily: {} };

  const days = useMemo(() => {
    const arr = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      const label = ['日', '一', '二', '三', '四', '五', '六'][d.getDay()];
      arr.push({ key, label: '周' + label, value: usage.daily?.[key] || 0 });
    }
    return arr;
  }, [usage.daily]);

  const peak = Math.max(1, ...days.map((d) => d.value));
  const usersWithUsage = data.users
    .map((u) => ({ ...u, ...(usage.byUser?.[u.id] || {}) }))
    .sort((a, b) => (b.tokens || 0) - (a.tokens || 0));

  return (
    <div className="admin-section">
      <div className="admin-section-header">
        <div>
          <div className="admin-section-title">使用统计</div>
          <div className="admin-section-desc">最近 7 天的总览（数据来自 Netlify Blobs）</div>
        </div>
      </div>

      {err && <div className="card" style={{ color: 'var(--danger)', marginBottom: 18 }}>{err}</div>}

      <div className="stat-grid">
        <div className="stat-card">
          <div className="stat-label">总用户</div>
          <div className="stat-value">{totalUsers}</div>
          <div className="stat-trend">活跃 {activeUsers}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">累计对话</div>
          <div className="stat-value">{usage.totalConversations || 0}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">累计 tokens</div>
          <div className="stat-value">{fmtTokens(usage.totalTokens || 0)}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">可用模型</div>
          <div className="stat-value">
            {(config?.models || []).filter((m) => m.enabled).length}
            <span style={{ fontSize: 18, color: 'var(--fg-faint)' }}>
              {' '}
              / {(config?.models || []).length}
            </span>
          </div>
          <div className="stat-trend">
            {(config?.models || []).filter((m) => m.vision).length} 个多模态
          </div>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 18 }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 14,
          }}
        >
          <div>
            <div style={{ fontWeight: 600, fontSize: 15 }}>每日 token 消耗</div>
            <div style={{ fontSize: 12, color: 'var(--fg-muted)' }}>过去 7 天</div>
          </div>
          <div style={{ fontSize: 12, color: 'var(--fg-muted)' }}>
            峰值 {fmtTokens(peak)}
          </div>
        </div>
        <div className="usage-chart">
          {days.map((d) => (
            <div key={d.key} className="usage-bar" title={`${d.label}: ${fmtTokens(d.value)}`}>
              <div
                className="usage-bar-fill"
                style={{ height: `${Math.max(2, (d.value / peak) * 100)}%` }}
              />
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8 }}>
          {days.map((d) => (
            <div
              key={d.key}
              style={{ flex: 1, textAlign: 'center', fontSize: 11, color: 'var(--fg-subtle)' }}
            >
              {d.label}
            </div>
          ))}
        </div>
      </div>

      <div className="card">
        <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 12 }}>最近活跃用户</div>
        {loading ? (
          <div className="empty-card">加载中…</div>
        ) : usersWithUsage.length === 0 ? (
          <div className="empty-card">暂无用户</div>
        ) : (
          <table className="table" style={{ border: 'none' }}>
            <tbody>
              {usersWithUsage.slice(0, 5).map((u) => (
                <tr key={u.id}>
                  <td style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div
                      className={'user-avatar ' + (u.role === 'admin' ? 'admin' : '')}
                      style={{ width: 24, height: 24, fontSize: 11 }}
                    >
                      {(u.name || u.email).slice(0, 1).toUpperCase()}
                    </div>
                    {u.name || u.email}
                  </td>
                  <td style={{ color: 'var(--fg-muted)' }}>{u.email}</td>
                  <td style={{ color: 'var(--fg-muted)', textAlign: 'right' }}>
                    {fmtTokens(u.tokens || 0)} tokens
                  </td>
                  <td style={{ color: 'var(--fg-subtle)', textAlign: 'right', width: 100 }}>
                    {fmtRelative(u.lastActiveAt || u.lastLoginAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function ModelsPanel({ config, refreshConfig }) {
  const [editing, setEditing] = useState(null);
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function save(patch) {
    setBusy(true);
    setError('');
    try {
      await api.saveConfig(patch);
      await refreshConfig();
    } catch (e) {
      setError(e.message || '保存失败');
    } finally {
      setBusy(false);
    }
  }

  async function toggleEnabled(model) {
    const next = (config.models || []).map((m) =>
      m.id === model.id ? { ...m, enabled: !m.enabled } : m
    );
    await save({ models: next });
  }

  async function removeModel(model) {
    if (!confirm(`删除模型「${model.name}」？`)) return;
    const next = (config.models || []).filter((m) => m.id !== model.id);
    await save({ models: next });
  }

  async function upsertModel(m, isNew) {
    const list = config.models || [];
    let next;
    if (isNew) {
      if (list.some((x) => x.id === m.id)) {
        setError('该 ID 已存在');
        return;
      }
      next = [...list, m];
    } else {
      next = list.map((x) => (x.id === m.id ? { ...x, ...m } : x));
    }
    await save({ models: next });
    setEditing(null);
    setCreating(false);
  }

  return (
    <div className="admin-section">
      <div className="admin-section-header">
        <div>
          <div className="admin-section-title">模型管理</div>
          <div className="admin-section-desc">配置可用模型与多模态、思考能力标记</div>
        </div>
        <button className="btn btn-primary" onClick={() => setCreating(true)} disabled={busy}>
          <I.Plus size={14} /> 添加模型
        </button>
      </div>

      {error && (
        <div className="card" style={{ color: 'var(--danger)', marginBottom: 12 }}>{error}</div>
      )}

      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>模型</th>
              <th>提供方</th>
              <th>能力</th>
              <th>状态</th>
              <th style={{ textAlign: 'right' }}>操作</th>
            </tr>
          </thead>
          <tbody>
            {(config.models || []).map((m) => (
              <tr key={m.id}>
                <td>
                  <div style={{ fontWeight: 500 }}>{m.name}</div>
                  <div
                    style={{
                      fontSize: 11,
                      color: 'var(--fg-subtle)',
                      fontFamily: 'var(--font-mono)',
                    }}
                  >
                    {m.id}
                  </div>
                </td>
                <td style={{ color: 'var(--fg-muted)' }}>{m.provider || '—'}</td>
                <td>
                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                    {m.vision && <span className="tag tag-vision">多模态</span>}
                    {m.reasoning && <span className="tag tag-reasoning">思考</span>}
                    {!m.vision && !m.reasoning && <span className="tag">仅聊天</span>}
                  </div>
                </td>
                <td>
                  <Toggle on={m.enabled} onChange={() => toggleEnabled(m)} />
                </td>
                <td className="row-actions">
                  <button className="icon-btn" onClick={() => setEditing(m)} title="编辑">
                    <I.Edit size={14} />
                  </button>
                  <button className="icon-btn" onClick={() => removeModel(m)} title="删除">
                    <I.Trash size={14} />
                  </button>
                </td>
              </tr>
            ))}
            {(config.models || []).length === 0 && (
              <tr>
                <td colSpan={5} className="empty-card" style={{ borderBottom: 'none' }}>
                  尚未配置任何模型，点击右上角「添加模型」开始
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {(editing || creating) && (
        <ModelEditor
          model={editing}
          onCancel={() => {
            setEditing(null);
            setCreating(false);
            setError('');
          }}
          onSave={(m) => upsertModel(m, !!creating)}
          busy={busy}
        />
      )}
    </div>
  );
}

function ModelEditor({ model, onCancel, onSave, busy }) {
  const [m, setM] = useState(
    model || { id: '', name: '', provider: '', desc: '', vision: false, reasoning: false, enabled: true }
  );
  const valid = m.id.trim() && m.name.trim();
  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title">{model ? '编辑模型' : '添加模型'}</div>
          <button className="icon-btn" onClick={onCancel}>
            <I.X size={18} />
          </button>
        </div>
        <div className="modal-body">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div>
              <label className="field-label">模型 ID</label>
              <input
                className="input"
                placeholder="provider/model-name"
                value={m.id}
                onChange={(e) => setM({ ...m, id: e.target.value })}
                disabled={!!model}
              />
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <div style={{ flex: 1 }}>
                <label className="field-label">显示名</label>
                <input
                  className="input"
                  value={m.name}
                  onChange={(e) => setM({ ...m, name: e.target.value })}
                />
              </div>
              <div style={{ flex: 1 }}>
                <label className="field-label">提供方</label>
                <input
                  className="input"
                  value={m.provider}
                  onChange={(e) => setM({ ...m, provider: e.target.value })}
                />
              </div>
            </div>
            <div>
              <label className="field-label">描述</label>
              <input
                className="input"
                value={m.desc || ''}
                onChange={(e) => setM({ ...m, desc: e.target.value })}
              />
            </div>
            <Row label="多模态能力" desc="可直接接收图像输入">
              <Toggle on={m.vision} onChange={(v) => setM({ ...m, vision: v })} />
            </Row>
            <Row label="思考模型" desc="输出包含 <think> 块的推理内容">
              <Toggle on={m.reasoning} onChange={(v) => setM({ ...m, reasoning: v })} />
            </Row>
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onCancel}>
            取消
          </button>
          <button
            className="btn btn-primary"
            disabled={!valid || busy}
            onClick={() => onSave({ ...m, id: m.id.trim(), name: m.name.trim() })}
          >
            {busy ? '保存中…' : '保存'}
          </button>
        </div>
      </div>
    </div>
  );
}

function UsersPanel({ me }) {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState(null);
  const [resetting, setResetting] = useState(null);

  async function refresh() {
    setLoading(true);
    setError('');
    try {
      const data = await api.listUsers();
      setUsers(data.users || []);
    } catch (e) {
      setError(e.message || '加载失败');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  async function patchUser(id, patch) {
    try {
      await api.updateUser(id, patch);
      await refresh();
    } catch (e) {
      setError(e.message || '更新失败');
    }
  }

  async function removeUser(u) {
    if (!confirm(`删除用户「${u.name || u.email}」？`)) return;
    try {
      await api.deleteUser(u.id);
      await refresh();
    } catch (e) {
      setError(e.message || '删除失败');
    }
  }

  return (
    <div className="admin-section">
      <div className="admin-section-header">
        <div>
          <div className="admin-section-title">用户管理</div>
          <div className="admin-section-desc">{users.length} 个账户</div>
        </div>
        <button className="btn btn-primary" onClick={() => setCreating(true)}>
          <I.Plus size={14} /> 新建用户
        </button>
      </div>

      {error && (
        <div className="card" style={{ color: 'var(--danger)', marginBottom: 12 }}>{error}</div>
      )}

      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>用户</th>
              <th>角色</th>
              <th>加入</th>
              <th>最近登录</th>
              <th>启用</th>
              <th style={{ textAlign: 'right' }}>操作</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={6} className="empty-card" style={{ borderBottom: 'none' }}>
                  加载中…
                </td>
              </tr>
            ) : users.length === 0 ? (
              <tr>
                <td colSpan={6} className="empty-card" style={{ borderBottom: 'none' }}>
                  暂无用户
                </td>
              </tr>
            ) : (
              users.map((u) => (
                <tr key={u.id}>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div
                        className={'user-avatar ' + (u.role === 'admin' ? 'admin' : '')}
                        style={{ width: 28, height: 28, fontSize: 11 }}
                      >
                        {(u.name || u.email).slice(0, 1).toUpperCase()}
                      </div>
                      <div>
                        <div style={{ fontWeight: 500 }}>{u.name || u.email}</div>
                        <div style={{ fontSize: 11, color: 'var(--fg-subtle)' }}>{u.email}</div>
                      </div>
                    </div>
                  </td>
                  <td>
                    <select
                      className="select"
                      style={{ width: 100, padding: '4px 8px' }}
                      value={u.role}
                      disabled={u.id === me.id}
                      onChange={(e) => patchUser(u.id, { role: e.target.value })}
                    >
                      <option value="user">普通</option>
                      <option value="admin">管理员</option>
                    </select>
                  </td>
                  <td style={{ color: 'var(--fg-muted)' }}>{fmtDate(u.createdAt)}</td>
                  <td style={{ color: 'var(--fg-subtle)' }}>{fmtRelative(u.lastLoginAt)}</td>
                  <td>
                    <Toggle
                      on={u.enabled}
                      onChange={() => u.id !== me.id && patchUser(u.id, { enabled: !u.enabled })}
                    />
                  </td>
                  <td className="row-actions">
                    <button
                      className="icon-btn"
                      onClick={() => setResetting(u)}
                      title="重置密码"
                    >
                      <I.Key size={14} />
                    </button>
                    <button
                      className="icon-btn"
                      onClick={() => setEditing(u)}
                      title="编辑"
                    >
                      <I.Edit size={14} />
                    </button>
                    <button
                      className="icon-btn"
                      onClick={() => removeUser(u)}
                      disabled={u.id === me.id}
                      title="删除"
                    >
                      <I.Trash size={14} />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {creating && (
        <UserEditor
          mode="create"
          onCancel={() => setCreating(false)}
          onSave={async (payload) => {
            try {
              await api.createUser(payload);
              setCreating(false);
              await refresh();
            } catch (e) {
              setError(e.message || '创建失败');
            }
          }}
        />
      )}
      {editing && (
        <UserEditor
          mode="edit"
          user={editing}
          onCancel={() => setEditing(null)}
          onSave={async (payload) => {
            await patchUser(editing.id, payload);
            setEditing(null);
          }}
        />
      )}
      {resetting && (
        <PasswordReset
          user={resetting}
          onCancel={() => setResetting(null)}
          onSave={async (password) => {
            await patchUser(resetting.id, { password });
            setResetting(null);
          }}
        />
      )}
    </div>
  );
}

function UserEditor({ mode, user, onCancel, onSave }) {
  const isCreate = mode === 'create';
  const [email, setEmail] = useState(user?.email || '');
  const [name, setName] = useState(user?.name || '');
  const [role, setRole] = useState(user?.role || 'user');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const valid = isCreate ? email.includes('@') && password.length >= 6 : true;

  async function submit() {
    setBusy(true);
    setErr('');
    try {
      const payload = isCreate
        ? { email, name, role, password }
        : { name, role };
      await onSave(payload);
    } catch (e) {
      setErr(e.message || '保存失败');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title">{isCreate ? '新建用户' : '编辑用户'}</div>
          <button className="icon-btn" onClick={onCancel}>
            <I.X size={18} />
          </button>
        </div>
        <div className="modal-body">
          {err && (
            <div
              style={{
                color: 'var(--danger)',
                fontSize: 13,
                marginBottom: 12,
                padding: '8px 10px',
                borderRadius: 8,
                background: 'rgba(193,69,69,0.08)',
              }}
            >
              {err}
            </div>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div>
              <label className="field-label">邮箱</label>
              <input
                className="input"
                type="email"
                value={email}
                disabled={!isCreate}
                onChange={(e) => setEmail(e.target.value.trim())}
              />
            </div>
            <div>
              <label className="field-label">显示名</label>
              <input
                className="input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="留空则使用邮箱前缀"
              />
            </div>
            <div>
              <label className="field-label">角色</label>
              <select
                className="select"
                value={role}
                onChange={(e) => setRole(e.target.value)}
              >
                <option value="user">普通用户</option>
                <option value="admin">管理员</option>
              </select>
            </div>
            {isCreate && (
              <div>
                <label className="field-label">初始密码</label>
                <input
                  className="input"
                  type="password"
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="至少 6 位"
                />
              </div>
            )}
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onCancel}>
            取消
          </button>
          <button className="btn btn-primary" disabled={!valid || busy} onClick={submit}>
            {busy ? '保存中…' : '保存'}
          </button>
        </div>
      </div>
    </div>
  );
}

function PasswordReset({ user, onCancel, onSave }) {
  const [pwd, setPwd] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title">重置密码</div>
          <button className="icon-btn" onClick={onCancel}>
            <I.X size={18} />
          </button>
        </div>
        <div className="modal-body">
          <div style={{ fontSize: 13, color: 'var(--fg-muted)', marginBottom: 12 }}>
            将为「{user.name || user.email}」设置新的登录密码。
          </div>
          {err && (
            <div style={{ color: 'var(--danger)', fontSize: 13, marginBottom: 12 }}>{err}</div>
          )}
          <input
            className="input"
            type="password"
            autoComplete="new-password"
            value={pwd}
            onChange={(e) => setPwd(e.target.value)}
            placeholder="至少 6 位"
          />
        </div>
        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onCancel}>
            取消
          </button>
          <button
            className="btn btn-primary"
            disabled={pwd.length < 6 || busy}
            onClick={async () => {
              setBusy(true);
              setErr('');
              try {
                await onSave(pwd);
              } catch (e) {
                setErr(e.message || '保存失败');
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? '保存中…' : '保存'}
          </button>
        </div>
      </div>
    </div>
  );
}

function PromptsPanel({ config, refreshConfig }) {
  const [prompt, setPrompt] = useState(config.systemPrompt || '');
  const [perModel, setPerModel] = useState(config.perModelPrompts || {});
  const [selectedModel, setSelectedModel] = useState(config.models?.[0]?.id || '');
  const [busyG, setBusyG] = useState(false);
  const [busyP, setBusyP] = useState(false);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    setPrompt(config.systemPrompt || '');
    setPerModel(config.perModelPrompts || {});
    if (!selectedModel && config.models?.[0]) setSelectedModel(config.models[0].id);
  }, [config]);

  async function saveGlobal() {
    setBusyG(true);
    setMsg('');
    try {
      await api.saveConfig({ systemPrompt: prompt });
      await refreshConfig();
      setMsg('已保存全局提示词');
    } catch (e) {
      setMsg(e.message || '保存失败');
    } finally {
      setBusyG(false);
    }
  }

  async function savePerModel() {
    setBusyP(true);
    setMsg('');
    try {
      // Trim empty entries before saving.
      const clean = {};
      for (const [k, v] of Object.entries(perModel)) {
        if (typeof v === 'string' && v.trim()) clean[k] = v;
      }
      await api.saveConfig({ perModelPrompts: clean });
      await refreshConfig();
      setMsg('已保存覆盖');
    } catch (e) {
      setMsg(e.message || '保存失败');
    } finally {
      setBusyP(false);
    }
  }

  return (
    <div className="admin-section">
      <div className="admin-section-header">
        <div>
          <div className="admin-section-title">系统提示词</div>
          <div className="admin-section-desc">全局提示词与按模型覆盖；服务端注入，前端不可篡改</div>
        </div>
      </div>

      {msg && (
        <div
          className="card"
          style={{ marginBottom: 12, fontSize: 13, color: 'var(--fg-muted)' }}
        >
          {msg}
        </div>
      )}

      <div className="card" style={{ marginBottom: 18 }}>
        <div style={{ fontWeight: 600, marginBottom: 4 }}>全局提示词</div>
        <div style={{ fontSize: 12, color: 'var(--fg-muted)', marginBottom: 12 }}>
          所有模型的默认 System Prompt
        </div>
        <textarea
          className="textarea"
          rows={10}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
        />
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 12 }}>
          <button className="btn btn-primary" disabled={busyG} onClick={saveGlobal}>
            {busyG ? '保存中…' : '保存'}
          </button>
        </div>
      </div>

      <div className="card">
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 12,
          }}
        >
          <div>
            <div style={{ fontWeight: 600 }}>按模型覆盖</div>
            <div style={{ fontSize: 12, color: 'var(--fg-muted)' }}>
              留空则使用全局提示词
            </div>
          </div>
          <select
            className="select"
            style={{ width: 220 }}
            value={selectedModel}
            onChange={(e) => setSelectedModel(e.target.value)}
          >
            {(config.models || []).map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </div>
        <textarea
          className="textarea"
          rows={6}
          placeholder="（留空 = 使用全局提示词）"
          value={perModel[selectedModel] || ''}
          onChange={(e) =>
            setPerModel({ ...perModel, [selectedModel]: e.target.value })
          }
        />
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
          <button className="btn btn-primary" disabled={busyP} onClick={savePerModel}>
            {busyP ? '保存中…' : '保存覆盖'}
          </button>
        </div>
      </div>
    </div>
  );
}

function OcrPanel({ config, refreshConfig }) {
  const visionModels = (config.models || []).filter((m) => m.vision && m.enabled);
  const [busy, setBusy] = useState(false);

  async function setOcr(id) {
    setBusy(true);
    try {
      await api.saveConfig({ ocrModelId: id });
      await refreshConfig();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="admin-section">
      <div className="admin-section-header">
        <div>
          <div className="admin-section-title">OCR 模型（伪多模态）</div>
          <div className="admin-section-desc">
            当用户向仅文本模型发送图片时，自动用此模型识别后再转交
          </div>
        </div>
      </div>
      <div className="card">
        <Row label="OCR 模型" desc="必须选择一个具备多模态能力且已启用的模型">
          <select
            className="select"
            style={{ width: 240 }}
            value={config.ocrModelId || ''}
            disabled={busy}
            onChange={(e) => setOcr(e.target.value)}
          >
            <option value="">— 未启用 —</option>
            {visionModels.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </Row>
        <div
          style={{
            marginTop: 12,
            padding: '12px 14px',
            background: 'var(--bg-elev)',
            borderRadius: 10,
            fontSize: 12,
            color: 'var(--fg-muted)',
            lineHeight: 1.6,
          }}
        >
          <strong>工作方式</strong>
          <br />
          1. 用户上传图片 + 文字 → 当前模型仅支持文本
          <br />
          2. 系统先调用 OCR 模型，让其用一段文字描述图片内容
          <br />
          3. 把描述与原始问题拼接后再发给目标模型
          <br />
          4. 助手消息上会出现「OCR · 模型名」徽章
        </div>
      </div>
    </div>
  );
}

function SearchSettingsPanel({ config, refreshConfig }) {
  const [depth, setDepth] = useState(config.tavilySearchDepth || 'basic');
  const [maxResults, setMaxResults] = useState(config.tavilyMaxResults || 10);
  const [topK, setTopK] = useState(config.fetchTopK ?? 3);
  const [jinaFetchEnabled, setJinaFetchEnabled] = useState(!!config.jinaFetchEnabled);
  const [maxRounds, setMaxRounds] = useState(config.searchAgentMaxRounds || 2);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    setDepth(config.tavilySearchDepth || 'basic');
    setMaxResults(config.tavilyMaxResults || 10);
    setTopK(config.fetchTopK ?? 3);
    setJinaFetchEnabled(!!config.jinaFetchEnabled);
    setMaxRounds(config.searchAgentMaxRounds || 2);
  }, [config]);

  async function save() {
    setBusy(true);
    setMsg('');
    try {
      await api.saveConfig({
        tavilySearchDepth: depth,
        tavilyMaxResults: Number(maxResults) || 10,
        fetchTopK: Number(topK),
        jinaFetchEnabled,
        searchAgentMaxRounds: Number(maxRounds) || 2,
      });
      await refreshConfig();
      setMsg('已保存');
    } catch (e) {
      setMsg(e.message || '保存失败');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="admin-section">
      <div className="admin-section-header">
        <div>
          <div className="admin-section-title">搜索（Tavily）</div>
          <div className="admin-section-desc">
            网络搜索与默认网页正文由 Tavily 驱动，密钥保存在服务端环境变量 <code>TAVILY_API_KEY</code>
          </div>
        </div>
      </div>
      <div className="card">
        <Row
          label="Tavily API Key"
          desc="出于安全考虑，密钥不在前端管理，请在 Netlify 环境变量中配置"
        >
          <span
            style={{
              fontSize: 13,
              color: 'var(--fg-muted)',
              fontFamily: 'var(--font-mono)',
            }}
          >
            env: TAVILY_API_KEY
          </span>
        </Row>
        <Row label="检索深度" desc="basic 适合快速问答，advanced 适合长文研究">
          <select
            className="select"
            style={{ width: 140 }}
            value={depth}
            onChange={(e) => setDepth(e.target.value)}
          >
            <option value="basic">basic</option>
            <option value="advanced">advanced</option>
          </select>
        </Row>
        <Row label="检索结果数" desc="单次搜索返回的最大网页数（1–20）">
          <input
            className="input"
            type="number"
            min={1}
            max={20}
            style={{ width: 90 }}
            value={maxResults}
            onChange={(e) => setMaxResults(e.target.value)}
          />
        </Row>
        <Row
          label="抓取条数"
          desc="对前 N 条结果获取网页正文（0 表示只检索不抓取正文）"
        >
          <input
            className="input"
            type="number"
            min={0}
            max={10}
            style={{ width: 90 }}
            value={topK}
            onChange={(e) => setTopK(e.target.value)}
          />
        </Row>
        <Row
          label="使用 Jina 抓取"
          desc="关闭时直接使用 Tavily 返回的网页正文；开启后改用 r.jina.ai 抓取前 N 条结果"
        >
          <Toggle on={jinaFetchEnabled} onChange={setJinaFetchEnabled} />
        </Row>
        <Row label="搜索规划轮次" desc="模型可根据资料相关性继续搜索的最大轮数（1–3）">
          <input
            className="input"
            type="number"
            min={1}
            max={3}
            style={{ width: 90 }}
            value={maxRounds}
            onChange={(e) => setMaxRounds(e.target.value)}
          />
        </Row>
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 14, gap: 8 }}>
          {msg && (
            <span style={{ fontSize: 13, color: 'var(--fg-muted)', alignSelf: 'center' }}>
              {msg}
            </span>
          )}
          <button className="btn btn-primary" disabled={busy} onClick={save}>
            {busy ? '保存中…' : '保存'}
          </button>
        </div>
      </div>
    </div>
  );
}

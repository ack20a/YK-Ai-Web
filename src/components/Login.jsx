import React, { useState } from 'react';

export default function Login({ onSubmit }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    if (!email || !password || busy) return;
    setError('');
    setBusy(true);
    try {
      await onSubmit(email.trim(), password);
    } catch (err) {
      setError(err.message || '登录失败，请稍后再试');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-logo">YK</div>
        <h1 className="login-title">登录 YK AI</h1>
        <p className="login-subtitle">私有部署的 AI 对话工作台</p>

        <form className="login-form" onSubmit={submit}>
          {error && <div className="login-error">{error}</div>}
          <div>
            <label className="field-label">邮箱</label>
            <input
              className="input"
              type="email"
              autoComplete="username"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div>
            <label className="field-label">密码</label>
            <input
              className="input"
              type="password"
              autoComplete="current-password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          <button type="submit" className="btn btn-primary" disabled={busy}>
            {busy ? '登录中…' : '登录'}
          </button>
        </form>

        <p className="login-hint">仅授权账户可访问。账号由管理员在控制台分发。</p>
      </div>
    </div>
  );
}

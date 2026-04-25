import React, { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import Login from './components/Login.jsx';
import Sidebar from './components/Sidebar.jsx';
import ChatView from './components/ChatView.jsx';
import Settings from './components/Settings.jsx';
import Admin from './components/Admin.jsx';
import { api } from './lib/api.js';
import { applyTheme, loadToken, saveToken, ensureMathJax } from './lib/utils.js';
import { reducer, loadUserState, saveUserState, loadGlobalPrefs, saveGlobalPrefs, DEFAULT_USER_STATE } from './store.js';

function Loading({ label = '加载中…' }) {
  return (
    <div className="app-loading">
      <span className="spinner-lg" />
      {label}
    </div>
  );
}

export default function App() {
  const [bootstrapping, setBootstrapping] = useState(true);
  const [me, setMe] = useState(null);
  const [config, setConfig] = useState(null);
  const [view, setView] = useState('chat');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [loadError, setLoadError] = useState('');

  const [state, dispatch] = useReducer(reducer, DEFAULT_USER_STATE);
  const meRef = useRef(null);

  // ---------- Bootstrap: validate token, fetch /me, fetch /config ----------
  useEffect(() => {
    let cancelled = false;
    (async () => {
      // Pre-initialize MathJax in the background.
      ensureMathJax();

      // Apply saved theme even before login.
      const prefs = loadGlobalPrefs();
      if (prefs.theme) applyTheme(prefs.theme);

      const token = loadToken();
      if (!token) {
        setBootstrapping(false);
        return;
      }
      try {
        const meRes = await api.me();
        if (cancelled) return;
        const cfgRes = await api.getConfig();
        if (cancelled) return;
        const userState = loadUserState(meRes.user.id);
        // Persisted theme is per-device; ensure it exists.
        if (prefs.theme) userState.theme = prefs.theme;
        dispatch({ type: 'replaceState', state: userState });
        setMe(meRes.user);
        meRef.current = meRes.user;
        setConfig(cfgRes.config);
      } catch (e) {
        saveToken(null);
        setLoadError(e.message || '登录已过期');
      } finally {
        if (!cancelled) setBootstrapping(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // ---------- Persist per-user state on every change ----------
  useEffect(() => {
    if (!me) return;
    saveUserState(me.id, state);
  }, [state, me]);

  // ---------- Theme ----------
  useEffect(() => {
    applyTheme(state.theme || 'auto');
    saveGlobalPrefs({ theme: state.theme || 'auto' });
  }, [state.theme]);

  useEffect(() => {
    if (state.theme !== 'auto') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = () => applyTheme('auto');
    mq.addEventListener?.('change', handler);
    return () => mq.removeEventListener?.('change', handler);
  }, [state.theme]);

  const refreshConfig = useCallback(async () => {
    const cfgRes = await api.getConfig();
    setConfig(cfgRes.config);
    return cfgRes.config;
  }, []);

  async function handleLogin(email, password) {
    const res = await api.login(email, password);
    saveToken(res.token);
    const cfgRes = await api.getConfig();
    const userState = loadUserState(res.user.id);
    const prefs = loadGlobalPrefs();
    if (prefs.theme) userState.theme = prefs.theme;
    dispatch({ type: 'replaceState', state: userState });
    setConfig(cfgRes.config);
    setMe(res.user);
    meRef.current = res.user;
    setLoadError('');
  }

  function handleLogout() {
    saveToken(null);
    setMe(null);
    setConfig(null);
    setView('chat');
    setSettingsOpen(false);
    dispatch({ type: 'replaceState', state: DEFAULT_USER_STATE });
  }

  // ---------- Render ----------
  if (bootstrapping) return <Loading />;

  if (!me) {
    return (
      <>
        {loadError && (
          <div className="toast-container">
            <div className="toast">{loadError}</div>
          </div>
        )}
        <Login onSubmit={handleLogin} />
      </>
    );
  }

  if (view === 'admin' && me.role === 'admin') {
    return (
      <>
        <Admin
          config={config}
          refreshConfig={refreshConfig}
          me={me}
          onExit={() => setView('chat')}
        />
        {settingsOpen && (
          <Settings
            state={state}
            dispatch={dispatch}
            me={me}
            onClose={() => setSettingsOpen(false)}
            onLogout={handleLogout}
          />
        )}
      </>
    );
  }

  return (
    <div className="app">
      <Sidebar
        state={state}
        dispatch={dispatch}
        me={me}
        collapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed((c) => !c)}
        onOpenSettings={() => setSettingsOpen(true)}
        onOpenAdmin={() => setView('admin')}
        onLogout={handleLogout}
      />
      <ChatView
        state={state}
        dispatch={dispatch}
        config={config}
        sidebarCollapsed={sidebarCollapsed}
        onToggleSidebar={() => setSidebarCollapsed((c) => !c)}
      />
      {settingsOpen && (
        <Settings
          state={state}
          dispatch={dispatch}
          me={me}
          onClose={() => setSettingsOpen(false)}
          onLogout={handleLogout}
        />
      )}
    </div>
  );
}

import { useEffect, useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useStore } from '../state/store.jsx';
import { t } from '../lib/i18n.js';
import { CommandPalette } from './CommandPalette.jsx';

const NAV = [
  { section: 'nav_main', items: [
    { to: '/', icon: '📊', label: 'dashboard' },
    { to: '/groups', icon: '👥', label: 'groups' },
    { to: '/users', icon: '🙋', label: 'users' },
    { to: '/vps', icon: '🖥️', label: 'vps' },
  ]},
  { section: 'nav_ai', items: [
    { to: '/providers', icon: '🔌', label: 'providers' },
    { to: '/models', icon: '🧩', label: 'models' },
    { to: '/personalities', icon: '🎭', label: 'personalities' },
    { to: '/memory', icon: '🧠', label: 'memory' },
    { to: '/moderation', icon: '🛡️', label: 'moderation' },
    { to: '/analytics', icon: '📈', label: 'analytics' },
  ]},
  { section: 'nav_system', items: [
    { to: '/audit', icon: '📜', label: 'audit' },
    { to: '/notifications', icon: '🔔', label: 'notifications' },
    { to: '/health', icon: '💚', label: 'health' },
    { to: '/security', icon: '🔐', label: 'security' },
  ]},
];

export function AppShell({ children }) {
  const { me, logout, theme, setTheme, toasts } = useStore();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setPaletteOpen(true); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const commands = [
    ...NAV.flatMap((s) => s.items).map((item) => ({
      icon: item.icon, label: t(item.label), hint: t(item.label),
      run: (nav) => nav(item.to),
    })),
    { icon: '🌗', label: `${t('theme')}: ${t(theme)}`, run: () => setTheme(theme === 'dark' ? 'light' : 'dark') },
  ];

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="logo">B</div>
          <div>
            <div className="brand-name">BotAI</div>
            <div className="brand-sub">AI Telegram Platform</div>
          </div>
        </div>
        {NAV.map((section) => (
          <div key={section.section}>
            <div className="nav-section">{t(section.section)}</div>
            {section.items.map((item) => (
              <NavLink key={item.to} to={item.to} end={item.to === '/'}
                className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}>
                <span className="icon">{item.icon}</span>{t(item.label)}
              </NavLink>
            ))}
          </div>
        ))}
      </aside>

      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0 }}>
        <header className="topbar">
          <button className="search-trigger" onClick={() => setPaletteOpen(true)}>
            🔍 {t('search_placeholder')} <kbd>Ctrl K</kbd>
          </button>
          <div className="spacer" />
          <button className="btn sm ghost" title={t('theme')}
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>
            {theme === 'dark' ? '☀️' : '🌙'}
          </button>
          <span className="muted" style={{ fontSize: 12 }}>{me?.email}</span>
          <button className="btn sm" onClick={logout}>{t('logout')}</button>
        </header>
        <main className="content">{children}</main>
      </div>

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} commands={commands} />

      <div className="toasts">
        {toasts.map((toast) => (
          <div key={toast.id} className={`toast ${toast.kind}`}>{toast.message}</div>
        ))}
      </div>
    </div>
  );
}

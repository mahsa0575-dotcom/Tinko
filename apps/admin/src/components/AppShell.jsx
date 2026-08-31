import { useEffect, useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useStore } from '../state/store.jsx';
import { t } from '../lib/i18n.js';
import { CommandPalette } from './CommandPalette.jsx';
import { Icon, LogoMark } from './icons.jsx';

const NAV = [
  { section: 'nav_main', items: [
    { to: '/', icon: 'dashboard', label: 'dashboard' },
    { to: '/groups', icon: 'users', label: 'groups' },
    { to: '/users', icon: 'user', label: 'users' },
    { to: '/vps', icon: 'server', label: 'vps' },
  ]},
  { section: 'nav_ai', items: [
    { to: '/providers', icon: 'plug', label: 'providers' },
    { to: '/models', icon: 'models', label: 'models' },
    { to: '/personalities', icon: 'mask', label: 'personalities' },
    { to: '/memory', icon: 'memory', label: 'memory' },
    { to: '/moderation', icon: 'shield', label: 'moderation' },
    { to: '/analytics', icon: 'chart', label: 'analytics' },
  ]},
  { section: 'nav_system', items: [
    { to: '/audit', icon: 'file', label: 'audit' },
    { to: '/notifications', icon: 'bell', label: 'notifications' },
    { to: '/health', icon: 'heart', label: 'health' },
    { to: '/security', icon: 'lock', label: 'security' },
  ]},
];

export function AppShell({ children }) {
  const { me, logout, theme, setTheme, lang, setLang, toasts } = useStore();
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
    { icon: theme === 'dark' ? 'sun' : 'moon', label: `${t('theme')}: ${t(theme)}`, run: () => setTheme(theme === 'dark' ? 'light' : 'dark') },
    { icon: 'globe', label: lang === 'fa' ? 'English' : 'فارسی', run: () => setLang(lang === 'fa' ? 'en' : 'fa') },
  ];

  const initial = (me?.email ?? '?').trim().charAt(0).toUpperCase();

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="logo"><LogoMark size={20} /></div>
          <div>
            <div className="brand-name">Tinko</div>
            <div className="brand-sub">AI Telegram Platform</div>
          </div>
        </div>
        {NAV.map((section) => (
          <div key={section.section}>
            <div className="nav-section">{t(section.section)}</div>
            {section.items.map((item) => (
              <NavLink key={item.to} to={item.to} end={item.to === '/'}
                className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}>
                <span className="icon"><Icon name={item.icon} size={17} /></span>{t(item.label)}
              </NavLink>
            ))}
          </div>
        ))}
        <div className="sidebar-foot">
          <div className="user-card">
            <div className="avatar">{initial}</div>
            <div className="user-meta">
              <div className="user-name" dir="ltr">{me?.email ?? '—'}</div>
              <div className="user-role">{t('role_admin')}</div>
            </div>
            <button className="btn sm ghost icon" title={t('logout')} onClick={logout} style={{ color: 'var(--text-faint)' }}>
              <Icon name="logout" size={15} />
            </button>
          </div>
        </div>
      </aside>

      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0 }}>
        <header className="topbar">
          <button className="search-trigger" onClick={() => setPaletteOpen(true)}>
            <Icon name="search" size={15} />
            {t('search_placeholder')}
            <kbd>Ctrl K</kbd>
          </button>
          <div className="spacer" />
          <button className="btn sm ghost icon" title={t('theme')}
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>
            <Icon name={theme === 'dark' ? 'sun' : 'moon'} size={16} />
          </button>
          <button className="btn sm ghost language-toggle" title={t('language')}
            onClick={() => setLang(lang === 'fa' ? 'en' : 'fa')}>
            <Icon name="globe" size={15} /> {lang === 'fa' ? 'EN' : 'فا'}
          </button>
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

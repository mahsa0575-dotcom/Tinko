import { useEffect, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useStore } from '../state/store.jsx';
import { t } from '../lib/i18n.js';
import { CommandPalette } from './CommandPalette.jsx';
import { Icon, LogoMark } from './icons.jsx';
import { Avatar, IconButton } from './ui.jsx';

const NAV = [
  {
    section: 'nav_main',
    items: [
      { to: '/', icon: 'dashboard', label: 'dashboard' },
      { to: '/groups', icon: 'users', label: 'groups' },
      { to: '/users', icon: 'user', label: 'users' },
      { to: '/vps', icon: 'server', label: 'vps' },
    ],
  },
  {
    section: 'nav_ai',
    items: [
      { to: '/providers', icon: 'plug', label: 'providers' },
      { to: '/models', icon: 'models', label: 'models' },
      { to: '/personalities', icon: 'mask', label: 'personalities' },
      { to: '/memory', icon: 'memory', label: 'memory' },
      { to: '/moderation', icon: 'shield', label: 'moderation' },
      { to: '/analytics', icon: 'chart', label: 'analytics' },
    ],
  },
  {
    section: 'nav_system',
    items: [
      { to: '/audit', icon: 'file', label: 'audit' },
      { to: '/notifications', icon: 'bell', label: 'notifications' },
      { to: '/health', icon: 'heart', label: 'health' },
      { to: '/security', icon: 'lock', label: 'security' },
    ],
  },
];

export function AppShell({ children }) {
  const { me, logout, theme, setTheme, lang, setLang, toasts } = useStore();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const location = useLocation();

  useEffect(() => {
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Close the mobile drawer whenever the route changes.
  useEffect(() => setDrawerOpen(false), [location.pathname]);

  const commands = [
    ...NAV.flatMap((s) => s.items).map((item) => ({
      icon: item.icon,
      label: t(item.label),
      keywords: item.to,
      run: (nav) => nav(item.to),
    })),
    {
      icon: theme === 'dark' ? 'sun' : 'moon',
      label: `${t('theme')}: ${t(theme === 'dark' ? 'light' : 'dark')}`,
      run: () => setTheme(theme === 'dark' ? 'light' : 'dark'),
    },
    {
      icon: 'globe',
      label: lang === 'fa' ? 'English' : 'فارسی',
      run: () => setLang(lang === 'fa' ? 'en' : 'fa'),
    },
    { icon: 'logout', label: t('logout'), run: () => logout() },
  ];

  return (
    <div className="app-shell">
      {drawerOpen && <div className="sidebar-scrim" onClick={() => setDrawerOpen(false)} />}

      <aside className={`sidebar${drawerOpen ? ' open' : ''}`}>
        <div className="brand">
          <span className="logo"><LogoMark size={21} /></span>
          <div className="brand-text">
            <div className="brand-name">Tinko</div>
            <div className="brand-sub">AI Telegram Platform</div>
          </div>
        </div>

        <nav>
          {NAV.map((section) => (
            <div className="nav-group" key={section.section}>
              <div className="nav-section">{t(section.section)}</div>
              {section.items.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.to === '/'}
                  title={t(item.label)}
                  className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}
                >
                  <span className="icon"><Icon name={item.icon} size={17} /></span>
                  <span className="nav-item-label">{t(item.label)}</span>
                </NavLink>
              ))}
            </div>
          ))}
        </nav>

        <div className="sidebar-foot">
          <div className="user-card">
            <Avatar name={me?.email} size="sm" />
            <div className="user-meta">
              <div className="user-name" dir="ltr">{me?.email ?? '—'}</div>
              <div className="user-role">{t('role_admin')}</div>
            </div>
            <IconButton small icon="logout" title={t('logout')} onClick={logout} />
          </div>
        </div>
      </aside>

      <div className="shell-main">
        <header className="topbar">
          <IconButton
            icon="menu"
            title="منو"
            className="sidebar-toggle"
            onClick={() => setDrawerOpen((v) => !v)}
          />
          <button className="search-trigger" onClick={() => setPaletteOpen(true)}>
            <Icon name="search" size={15} />
            <span>{t('search_placeholder')}</span>
            <kbd>Ctrl K</kbd>
          </button>
          <div className="spacer" />
          <IconButton
            icon={theme === 'dark' ? 'sun' : 'moon'}
            title={t('theme')}
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          />
          <button
            className="btn sm ghost language-toggle"
            title={t('language')}
            onClick={() => setLang(lang === 'fa' ? 'en' : 'fa')}
          >
            <Icon name="globe" size={15} />
            {lang === 'fa' ? 'EN' : 'فا'}
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

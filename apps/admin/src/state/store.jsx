import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { api, setToken, setUnauthorizedHandler } from '../lib/api.js';
import { setLang } from '../lib/i18n.js';

const StoreContext = createContext(null);

export function StoreProvider({ children }) {
  const [theme, setThemeState] = useState(localStorage.getItem('botai_theme') || 'dark');
  const [me, setMe] = useState(null);
  const [authReady, setAuthReady] = useState(false);
  const [toasts, setToasts] = useState([]);

  // theme
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem('botai_theme', theme);
  }, [theme]);

  // direction mirrors selected language
  useEffect(() => {
    const lang = localStorage.getItem('botai_lang') || 'fa';
    setLang(lang);
    document.documentElement.dataset.dir = lang === 'fa' ? 'rtl' : 'ltr';
  }, []);

  // session bootstrap
  useEffect(() => {
    setUnauthorizedHandler(() => { setMe(null); setAuthReady(true); });
    api('/auth/me')
      .then(setMe)
      .catch(() => {})
      .finally(() => setAuthReady(true));
  }, []);

  const toast = useCallback((message, kind = 'info') => {
    const id = Math.random().toString(36).slice(2);
    setToasts((prev) => [...prev, { id, message, kind }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 4200);
  }, []);

  const login = async (email, password, code) => {
    const data = await api('/auth/login', { method: 'POST', body: { email, password, code } });
    setToken(data.accessToken);
    setMe(await api('/auth/me'));
  };
  const logout = async () => {
    try { await api('/auth/logout', { method: 'POST' }); } catch { /* best effort */ }
    setToken(null);
    setMe(null);
  };

  return (
    <StoreContext.Provider value={{ theme, setTheme: setThemeState, me, setMe, authReady, login, logout, toast, toasts }}>
      {children}
    </StoreContext.Provider>
  );
}

export const useStore = () => useContext(StoreContext);

import { useState } from 'react';
import { useStore } from '../state/store.jsx';
import { t } from '../lib/i18n.js';

export function LoginPage() {
  const { login, toast } = useStore();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [needsCode, setNeedsCode] = useState(false);
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await login(email, password, code || undefined);
    } catch (err) {
      if (err.code === 'TOTP_REQUIRED') {
        setNeedsCode(true);
        toast('کد دو مرحله‌ای را وارد کنید', 'info');
      } else {
        toast(err.message || t('login_failed'), 'error');
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth-page">
      <form className="card auth-card" onSubmit={submit}>
        <div className="auth-logo">
          <div className="logo">B</div>
          <h2>{t('login_title')}</h2>
        </div>
        <div className="field">
          <label htmlFor="email">{t('email')}</label>
          <input id="email" className="input" type="email" dir="ltr" value={email} required
            onChange={(e) => setEmail(e.target.value)} autoComplete="username" />
        </div>
        <div className="field">
          <label htmlFor="password">{t('password')}</label>
          <input id="password" className="input" type="password" dir="ltr" value={password} required
            onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
        </div>
        {needsCode && (
          <div className="field">
            <label htmlFor="code">کد دو مرحله‌ای (TOTP یا کد بازیابی)</label>
            <input id="code" className="input" dir="ltr" value={code}
              onChange={(e) => setCode(e.target.value)} autoComplete="one-time-code" />
          </div>
        )}
        <button className="btn primary" style={{ width: '100%', justifyContent: 'center', marginTop: 8 }} disabled={busy}>
          {busy ? t('loading') : t('login')}
        </button>
      </form>
    </div>
  );
}

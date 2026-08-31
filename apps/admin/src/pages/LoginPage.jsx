import { useState } from 'react';
import { useStore } from '../state/store.jsx';
import { t } from '../lib/i18n.js';
import { Icon, LogoMark } from '../components/icons.jsx';
import { Spinner } from '../components/ui.jsx';

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
      <div className="auth-aurora" aria-hidden="true">
        <div className="orb orb-1" />
        <div className="orb orb-2" />
        <div className="orb orb-3" />
      </div>
      <form className="auth-card" onSubmit={submit}>
        <div className="auth-logo">
          <div className="logo"><LogoMark size={28} /></div>
          <h2>{t('login_title')}</h2>
          <div className="auth-tagline">{t('login_tagline')}</div>
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
            <label htmlFor="code">{t('totp_label')}</label>
            <input id="code" className="input" dir="ltr" value={code}
              onChange={(e) => setCode(e.target.value)} autoComplete="one-time-code" />
          </div>
        )}
        <button className="btn primary" style={{ width: '100%', justifyContent: 'center', marginTop: 10, padding: '11px 15px', fontSize: 14 }} disabled={busy}>
          {busy ? <><Spinner size={15} />{t('loading')}</> : <><Icon name="logout" size={16} style={{ transform: 'rotate(180deg)' }} />{t('login')}</>}
        </button>
        <div className="auth-foot">
          <Icon name="shieldCheck" size={12} style={{ verticalAlign: '-2px' }} />
          {' '}اتصال امن · احراز هویت دوعاملی · دسترسی نقش‌محور
        </div>
      </form>
    </div>
  );
}

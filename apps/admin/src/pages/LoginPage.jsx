import { useState } from 'react';
import { useStore } from '../state/store.jsx';
import { t } from '../lib/i18n.js';
import { Icon, LogoMark } from '../components/icons.jsx';
import { Field, Spinner } from '../components/ui.jsx';

export function LoginPage() {
  const { login, toast } = useStore();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [needsCode, setNeedsCode] = useState(false);
  const [showPass, setShowPass] = useState(false);
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
          <span className="logo"><LogoMark size={28} /></span>
          <h2>{t('login_title')}</h2>
          <div className="auth-tagline">{t('login_tagline')}</div>
        </div>

        <Field label={t('email')} htmlFor="email" required>
          <input
            id="email" className="input" type="email" dir="ltr" value={email} required
            placeholder="admin@example.com" autoComplete="username"
            onChange={(e) => setEmail(e.target.value)}
          />
        </Field>

        <Field label={t('password')} htmlFor="password" required>
          <div className="input-icon">
            <input
              id="password" className="input" type={showPass ? 'text' : 'password'} dir="ltr"
              value={password} required autoComplete="current-password"
              style={{ paddingInlineEnd: 40, paddingInlineStart: 12 }}
              onChange={(e) => setPassword(e.target.value)}
            />
            <button
              type="button" className="icon-btn sm" aria-label="نمایش گذرواژه"
              style={{ position: 'absolute', insetInlineEnd: 4 }}
              onClick={() => setShowPass((v) => !v)}
            >
              <Icon name={showPass ? 'eyeOff' : 'eye'} size={15} />
            </button>
          </div>
        </Field>

        {needsCode && (
          <Field label={t('totp_label')} htmlFor="code" required>
            <input
              id="code" className="input mono" dir="ltr" value={code} inputMode="numeric"
              placeholder="000000" autoComplete="one-time-code"
              onChange={(e) => setCode(e.target.value)}
            />
          </Field>
        )}

        <button className="btn primary lg block" disabled={busy} style={{ marginTop: 6 }}>
          {busy ? (
            <><Spinner size={16} />{t('loading')}</>
          ) : (
            <><Icon name="logout" size={16} style={{ transform: 'scaleX(-1)' }} />{t('login')}</>
          )}
        </button>

        <div className="auth-foot">
          <Icon name="shieldCheck" size={13} />
          اتصال امن · احراز هویت دوعاملی · دسترسی نقش‌محور
        </div>
      </form>
    </div>
  );
}

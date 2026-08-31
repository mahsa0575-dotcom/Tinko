import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { fmtTime, t } from '../lib/i18n.js';
import { useStore } from '../state/store.jsx';

/** Security page: 2FA (TOTP + recovery codes) + active sessions (spec §121–123). */
export function SecurityPage() {
  const { toast } = useStore();
  const [setup, setSetup] = useState(null);       // {secret, otpauth}
  const [code, setCode] = useState('');
  const [recoveryCodes, setRecoveryCodes] = useState(null);
  const [sessions, setSessions] = useState(null);
  const [enabled, setEnabled] = useState(false);  // unknown until setup attempted

  const startSetup = async () => {
    try {
      setSetup(await api('/auth/2fa/setup', { method: 'POST' }));
      loadSessions();
    } catch (err) {
      if (err.code === 'CONFLICT') { setEnabled(true); toast('2FA همین حالا فعال است', 'info'); }
      else toast(err.message, 'error');
    }
  };

  const enable2fa = async () => {
    try {
      const result = await api('/auth/2fa/enable', { method: 'POST', body: { code } });
      setRecoveryCodes(result.recoveryCodes);
      setSetup(null); setCode(''); setEnabled(true);
      toast('2FA فعال شد — کدهای بازیابی را ذخیره کنید!', 'success');
    } catch (err) { toast(err.message, 'error'); }
  };

  const disable2fa = async () => {
    try {
      await api('/auth/2fa/disable', { method: 'POST', body: { code } });
      setEnabled(false); setCode('');
      toast('2FA غیرفعال شد', 'info');
    } catch (err) { toast(err.message, 'error'); }
  };

  const loadSessions = () => api('/auth/sessions').then(setSessions).catch(() => {});
  useEffect(() => { loadSessions(); }, []);

  const revoke = async (id) => {
    try { await api(`/auth/sessions/${id}`, { method: 'DELETE' }); loadSessions(); toast(t('deleted'), 'success'); }
    catch (err) { toast(err.message, 'error'); }
  };
  const revokeAll = async () => {
    try { await api('/auth/sessions', { method: 'DELETE' }); loadSessions(); toast('همه‌ی نشست‌های دیگر لغو شدند', 'success'); }
    catch (err) { toast(err.message, 'error'); }
  };

  return (
    <div className="page">
      <h1 className="page-title">🔐 امنیت</h1>
      <p className="page-subtitle">ورود دو مرحله‌ای و مدیریت نشست‌ها</p>

      <div className="grid grid-2">
        <div className="card">
          <div className="card-title">🛡️ ورود دو مرحله‌ای (TOTP)</div>
          {!setup && !enabled && (
            <button className="btn primary" onClick={startSetup}>فعال‌سازی 2FA</button>
          )}
          {setup && (
            <div>
              <p className="muted" style={{ fontSize: 13 }}>این کلید را در Google Authenticator / Authy وارد کنید:</p>
              <pre className="mono" style={{ background: 'var(--surface-3)', padding: 12, borderRadius: 8, direction: 'ltr', fontSize: 16, textAlign: 'center' }}>{setup.secret}</pre>
              <p className="faint" style={{ fontSize: 11, direction: 'ltr', wordBreak: 'break-all' }}>{setup.otpauth}</p>
              <div className="field mt"><label>کد ۶ رقمی</label>
                <input className="input" dir="ltr" maxLength={10} value={code}
                  onChange={(e) => setCode(e.target.value)} />
              </div>
              <button className="btn primary" onClick={enable2fa}>تأیید و فعال‌سازی</button>
            </div>
          )}
          {enabled && (
            <div>
              <span className="badge success">2FA فعال است</span>
              <div className="field mt"><label>کد ۶ رقمی برای غیرفعال‌سازی</label>
                <input className="input" dir="ltr" maxLength={10} value={code}
                  onChange={(e) => setCode(e.target.value)} />
              </div>
              <button className="btn danger" onClick={disable2fa}>غیرفعال‌سازی 2FA</button>
            </div>
          )}
          {recoveryCodes && (
            <div className="card mt" style={{ borderColor: 'var(--warning)' }}>
              <div className="card-title">⚠️ کدهای بازیابی (فقط همین یک بار نمایش داده می‌شوند)</div>
              <pre className="mono" style={{ direction: 'ltr', textAlign: 'center', fontSize: 13 }}>
                {recoveryCodes.join('\n')}
              </pre>
              <button className="btn" onClick={() => setRecoveryCodes(null)}>ذخیره کردم</button>
            </div>
          )}
        </div>

        <div className="card">
          <div className="card-title">💻 نشست‌های فعال <button className="btn sm ghost" onClick={loadSessions}>🔄</button></div>
          {(sessions ?? []).map((s) => (
            <div key={s.id} className="row" style={{ justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
              <div>
                <div className="mono" style={{ fontSize: 11, maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', direction: 'ltr' }}>
                  {s.user_agent || '—'}
                </div>
                <div className="faint" style={{ fontSize: 11 }}>{fmtTime(s.created_at)} · {s.ip ?? '—'}</div>
              </div>
              <button className="btn sm danger" onClick={() => revoke(s.id)}>لغو</button>
            </div>
          ))}
          {sessions && sessions.length === 0 && <div className="muted">نشستی یافت نشد</div>}
          <button className="btn danger mt" onClick={revokeAll}>لغو همه‌ی نشست‌های دیگر</button>
        </div>
      </div>
    </div>
  );
}

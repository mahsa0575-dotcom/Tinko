import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { fmtNum, fmtTime, t } from '../lib/i18n.js';
import {
  PageHeader, SectionCard, Field, CodeBlock, Notice, EmptyState,
  List, ListRow, IconButton, ConfirmDialog,
} from '../components/ui.jsx';
import { useStore } from '../state/store.jsx';
import { Icon } from '../components/icons.jsx';

const deviceLabel = (ua) => {
  const s = String(ua ?? '');
  if (!s) return 'دستگاه ناشناس';
  const browser = /Edg\//.test(s) ? 'Edge'
    : /OPR\//.test(s) ? 'Opera'
    : /Chrome\//.test(s) ? 'Chrome'
    : /Safari\//.test(s) ? 'Safari'
    : /Firefox\//.test(s) ? 'Firefox'
    : 'مرورگر';
  const os = /Windows/.test(s) ? 'Windows'
    : /Android/.test(s) ? 'Android'
    : /iPhone|iPad|iOS/.test(s) ? 'iOS'
    : /Mac OS X/.test(s) ? 'macOS'
    : /Linux/.test(s) ? 'Linux'
    : '';
  return os ? `${browser} · ${os}` : browser;
};

/** Security page: 2FA (TOTP + recovery codes) + active sessions. */
export function SecurityPage() {
  const { toast } = useStore();
  const [setup, setSetup] = useState(null);       // {secret, otpauth}
  const [code, setCode] = useState('');
  const [recoveryCodes, setRecoveryCodes] = useState(null);
  const [sessions, setSessions] = useState(null);
  const [enabled, setEnabled] = useState(false);  // unknown until setup attempted
  const [revoking, setRevoking] = useState(null);
  const [revokeAllOpen, setRevokeAllOpen] = useState(false);

  const loadSessions = () => api('/auth/sessions').then(setSessions).catch(() => {});
  useEffect(() => { loadSessions(); }, []);

  const startSetup = async () => {
    try {
      setSetup(await api('/auth/2fa/setup', { method: 'POST' }));
      loadSessions();
    } catch (err) {
      if (err.code === 'CONFLICT') { setEnabled(true); toast('ورود دو مرحله‌ای همین حالا فعال است', 'info'); }
      else toast(err.message, 'error');
    }
  };

  const enable2fa = async () => {
    try {
      const result = await api('/auth/2fa/enable', { method: 'POST', body: { code } });
      setRecoveryCodes(result.recoveryCodes);
      setSetup(null); setCode(''); setEnabled(true);
      toast('ورود دو مرحله‌ای فعال شد — کدهای بازیابی را ذخیره کنید!', 'success');
    } catch (err) { toast(err.message, 'error'); }
  };

  const disable2fa = async () => {
    try {
      await api('/auth/2fa/disable', { method: 'POST', body: { code } });
      setEnabled(false); setCode('');
      toast('ورود دو مرحله‌ای غیرفعال شد', 'info');
    } catch (err) { toast(err.message, 'error'); }
  };

  const revoke = async (id) => {
    try {
      await api(`/auth/sessions/${id}`, { method: 'DELETE' });
      setRevoking(null); loadSessions(); toast('نشست لغو شد', 'success');
    } catch (err) { toast(err.message, 'error'); }
  };
  const revokeAll = async () => {
    try {
      await api('/auth/sessions', { method: 'DELETE' });
      setRevokeAllOpen(false); loadSessions();
      toast('همهٔ نشست‌های دیگر لغو شدند', 'success');
    } catch (err) { toast(err.message, 'error'); }
  };

  return (
    <div className="page">
      <PageHeader
        icon="lock"
        title={t('security')}
        subtitle="ورود دو مرحله‌ای، کدهای بازیابی و مدیریت نشست‌های فعال"
      />

      <div className="grid grid-2">
        {/* ---- 2FA ---- */}
        <SectionCard
          icon="shieldCheck"
          title="ورود دو مرحله‌ای"
          subtitle="با استفاده از اپلیکیشن‌های TOTP مانند Google Authenticator"
          accent={enabled ? 'success' : undefined}
          actions={enabled
            ? <span className="badge success"><span className="dot" /> فعال</span>
            : <span className="badge neutral">غیرفعال</span>}
        >
          <div className="col">
            {!setup && !enabled && (
              <>
                <Notice kind="warn" title="حساب شما بدون لایهٔ دوم محافظت می‌شود">
                  فعال‌سازی ورود دو مرحله‌ای به‌شدت توصیه می‌شود؛ در صورت لو رفتن گذرواژه،
                  دسترسی به پنل همچنان محافظت‌شده می‌ماند.
                </Notice>
                <button className="btn primary block" onClick={startSetup}>
                  <Icon name="shieldCheck" size={14} /> فعال‌سازی ورود دو مرحله‌ای
                </button>
              </>
            )}

            {setup && (
              <>
                <Notice
                  kind="info"
                  icon="qr"
                  title="گام ۱ — افزودن به اپلیکیشن"
                  actions={setup.otpauth ? (
                    <a className="btn xs" href={setup.otpauth}>
                      <Icon name="external" size={12} /> افزودن خودکار
                    </a>
                  ) : null}
                >
                  روی موبایل «افزودن خودکار» را بزنید، یا کلید زیر را دستی در
                  Google Authenticator / Authy وارد کنید.
                </Notice>

                <CodeBlock title="کلید مخفی" center copyable>{setup.secret}</CodeBlock>

                {setup.otpauth && (
                  <CodeBlock title="نشانی otpauth (برای ورود دستی)" copyable compact>
                    {setup.otpauth}
                  </CodeBlock>
                )}

                <Field label="گام ۲ — کد ۶ رقمی اپلیکیشن" required>
                  <input className="input mono" dir="ltr" maxLength={10} inputMode="numeric"
                    placeholder="000000" value={code} onChange={(e) => setCode(e.target.value)} />
                </Field>

                <div className="row">
                  <button className="btn ghost" onClick={() => { setSetup(null); setCode(''); }}>
                    {t('cancel')}
                  </button>
                  <div className="spacer" />
                  <button className="btn primary" onClick={enable2fa} disabled={code.trim().length < 6}>
                    تأیید و فعال‌سازی
                  </button>
                </div>
              </>
            )}

            {enabled && (
              <>
                <Notice kind="good" title="حساب شما محافظت‌شده است">
                  در هر ورود، کد یک‌بارمصرف اپلیکیشن پرسیده می‌شود.
                </Notice>
                <Field label="کد ۶ رقمی برای غیرفعال‌سازی"
                  hint="برای امنیت، غیرفعال‌سازی نیازمند تأیید هویت است.">
                  <input className="input mono" dir="ltr" maxLength={10} inputMode="numeric"
                    placeholder="000000" value={code} onChange={(e) => setCode(e.target.value)} />
                </Field>
                <button className="btn danger block" onClick={disable2fa} disabled={code.trim().length < 6}>
                  <Icon name="ban" size={14} /> غیرفعال‌سازی ورود دو مرحله‌ای
                </button>
              </>
            )}

            {recoveryCodes && (
              <SectionCard
                accent="warning"
                icon="alert"
                title="کدهای بازیابی"
                subtitle="فقط همین یک بار نمایش داده می‌شوند — آن‌ها را در جای امن نگه دارید"
                footer={(
                  <>
                    <div className="spacer" />
                    <button className="btn primary" onClick={() => setRecoveryCodes(null)}>
                      <Icon name="check" size={13} /> ذخیره کردم
                    </button>
                  </>
                )}
              >
                <CodeBlock center copyable>{recoveryCodes.join('\n')}</CodeBlock>
              </SectionCard>
            )}
          </div>
        </SectionCard>

        {/* ---- Sessions ---- */}
        <SectionCard
          icon="terminal"
          title="نشست‌های فعال"
          subtitle="دستگاه‌هایی که در حال حاضر به این حساب وارد شده‌اند"
          actions={(
            <>
              {sessions && <span className="badge neutral">{fmtNum(sessions.length)}</span>}
              <IconButton icon="refresh" title={t('refresh')} onClick={loadSessions} />
            </>
          )}
          footer={sessions && sessions.length > 0 ? (
            <>
              <span className="faint xs">لغو همه، نشست فعلی شما را نگه می‌دارد.</span>
              <div className="spacer" />
              <button className="btn danger sm" onClick={() => setRevokeAllOpen(true)}>
                <Icon name="ban" size={13} /> لغو همهٔ نشست‌های دیگر
              </button>
            </>
          ) : null}
        >
          {!sessions ? (
            <span className="muted sm">{t('loading')}</span>
          ) : sessions.length === 0 ? (
            <EmptyState icon="terminal" title="نشست فعالی یافت نشد"
              text="هیچ ورود فعالی برای این حساب ثبت نشده است." />
          ) : (
            <List bordered>
              {sessions.map((s) => (
                <ListRow
                  key={s.id}
                  icon="terminal"
                  title={deviceLabel(s.user_agent)}
                  subtitle={(
                    <span className="ltr">{s.ip ?? '—'} · {fmtTime(s.created_at)}</span>
                  )}
                  end={<IconButton icon="ban" title="لغو نشست" danger onClick={() => setRevoking(s)} />}
                />
              ))}
            </List>
          )}
        </SectionCard>
      </div>

      {revoking && (
        <ConfirmDialog
          title="لغو نشست"
          message={`نشست «${deviceLabel(revoking.user_agent)}» لغو شود؟ آن دستگاه باید دوباره وارد شود.`}
          confirmLabel="لغو کن"
          onConfirm={() => revoke(revoking.id)}
          onClose={() => setRevoking(null)}
        />
      )}

      {revokeAllOpen && (
        <ConfirmDialog
          title="لغو همهٔ نشست‌ها"
          message="همهٔ نشست‌های دیگر لغو می‌شوند و آن دستگاه‌ها باید دوباره وارد شوند. ادامه می‌دهید؟"
          confirmLabel="لغو همه"
          onConfirm={revokeAll}
          onClose={() => setRevokeAllOpen(false)}
        />
      )}
    </div>
  );
}

import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../lib/api.js';
import { fmtNum, t } from '../lib/i18n.js';
import {
  Modal, ConfirmDialog, PageHeader, SectionCard, Field,
  IconButton, EmptyState, Notice,
} from '../components/ui.jsx';
import { useStore } from '../state/store.jsx';
import { Icon } from '../components/icons.jsx';

const PROFILES = {
  fast: 'سریع', balanced: 'متعادل', smart: 'هوشمند', reasoning: 'استدلالی',
  vision: 'تصویری', cheap: 'کم‌هزینه', premium: 'ممتاز', long_context: 'زمینهٔ بلند',
};

/** Personality Studio: config panel + prompt editor + live test chat. */
export function PersonalitiesPage() {
  const { toast } = useStore();
  const [rows, setRows] = useState(null);
  const [editing, setEditing] = useState(null);   // personality being edited
  const [form, setForm] = useState(null);
  const [chat, setChat] = useState([]);           // [{role, content}]
  const [chatInput, setChatInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [identity, setIdentity] = useState(null);
  const [tg, setTg] = useState({ configured: false, masked: null, username: null });
  const [tokenInput, setTokenInput] = useState('');
  const [tgBusy, setTgBusy] = useState(false);
  const [confirmRemoveToken, setConfirmRemoveToken] = useState(false);
  const logRef = useRef(null);

  const load = useCallback(async () => {
    try {
      setRows(await api('/personalities'));
      setIdentity(await api('/settings/bot-identity'));
      setTg(await api('/settings/bot-token'));
    } catch (err) { toast(err.message, 'error'); }
  }, [toast]);
  useEffect(() => { load(); }, [load]);

  const saveToken = async () => {
    if (!tokenInput.trim()) return;
    setTgBusy(true);
    try {
      const result = await api('/settings/bot-token', { method: 'PUT', body: { token: tokenInput.trim() } });
      toast(`متصل شد: @${result.username} — ${result.note}`, 'success');
      setTokenInput('');
      setTg(await api('/settings/bot-token'));
    } catch (err) { toast(err.message, 'error'); }
    finally { setTgBusy(false); }
  };

  const removeToken = async () => {
    try {
      await api('/settings/bot-token', { method: 'DELETE' });
      toast('توکن حذف شد', 'info');
      setConfirmRemoveToken(false);
      setTg(await api('/settings/bot-token'));
    } catch (err) { toast(err.message, 'error'); }
  };

  const saveIdentity = async () => {
    try {
      setIdentity(await api('/settings/bot-identity', { method: 'PUT', body: identity }));
      toast(`نام ربات ذخیره شد — در گروه با «${identity.name} خوبی؟» صدایش بزنید`, 'success');
    } catch (err) { toast(err.message, 'error'); }
  };

  const startCreate = () => {
    setForm({
      slug: '', display_name: '', description: '', system_prompt: '',
      model_profile_key: 'balanced', config: {},
    });
    setChat([]);
    setEditing({ id: null });
  };
  const startEdit = (p) => {
    // Full record includes system_prompt
    api(`/personalities/${p.id}`).then((full) => {
      setForm({
        slug: full.slug, display_name: full.display_name, description: full.description ?? '',
        system_prompt: full.system_prompt ?? '', model_profile_key: full.model_profile_key ?? 'balanced',
        config: typeof full.config === 'string' ? JSON.parse(full.config || '{}') : full.config ?? {},
      });
      setEditing(full);
      setChat([]);
    }).catch((err) => toast(err.message, 'error'));
  };
  const setF = (patch) => setForm((f) => ({ ...f, ...patch }));

  const save = async () => {
    try {
      const body = { ...form, __summary: 'پنل: ویرایش پرامپت/تنظیمات' };
      if (editing.id) {
        await api(`/personalities/${editing.id}`, { method: 'PATCH', body });
      } else {
        await api('/personalities', { method: 'POST', body });
      }
      toast(t('saved'), 'success');
      setEditing(null);
      load();
    } catch (err) { toast(err.message, 'error'); }
  };

  const sendTest = async () => {
    const message = chatInput.trim();
    if (!message || busy) return;
    setBusy(true);
    setChatInput('');
    setChat((c) => [...c, { role: 'user', content: message }]);
    try {
      const result = await api('/personalities/test-chat', {
        method: 'POST',
        body: {
          messages: chat.concat([{ role: 'user', content: message }]).map((m) => ({
            role: m.role === 'bot' ? 'assistant' : m.role, content: m.content,
          })),
          personalityId: editing?.id ?? undefined,
          profileKey: form?.model_profile_key ?? undefined,
        },
      });
      setChat((c) => [...c, { role: 'bot', content: result.content }]);
      setTimeout(() => logRef.current?.scrollTo({ top: 1e6 }), 30);
    } catch (err) {
      setChat((c) => [...c, { role: 'bot', content: `خطا: ${err.message}` }]);
    } finally { setBusy(false); }
  };

  const promptChars = (form?.system_prompt ?? '').length;

  return (
    <div className="page">
      <PageHeader
        icon="mask"
        title={t('personalities')}
        subtitle="هر گروه می‌تواند شخصیت مستقل خودش را داشته باشد — لحن، دانش و قواعد پاسخ‌دهی"
        actions={(
          <button className="btn primary sm" onClick={startCreate}>
            <Icon name="plus" size={13} /> شخصیت جدید
          </button>
        )}
      />

      <div className="grid grid-2">
        {/* Bot identity: the name users call in groups */}
        {identity && (
          <SectionCard
            accent="primary"
            icon="mask"
            title="هویت ربات"
            subtitle="نامی که کاربران در گروه با آن ربات را صدا می‌زنند"
          >
            <div className="col">
              <Field label="نام ربات" required>
                <input className="input" value={identity.name}
                  onChange={(e) => setIdentity({ ...identity, name: e.target.value })} />
              </Field>
              <Field label="معرفی کوتاه" hint="اختیاری — در پاسخ‌های معرفی استفاده می‌شود.">
                <input className="input" value={identity.bio ?? ''}
                  onChange={(e) => setIdentity({ ...identity, bio: e.target.value })} />
              </Field>
              <Notice kind="info" icon="info">
                پس از ذخیره، هر کسی در گروه بنویسد «{identity.name || 'نام ربات'} خوبی؟»
                ربات مستقیماً با ریپلای به همان فرد پاسخ می‌دهد.
              </Notice>
              <div className="row">
                <div className="spacer" />
                <button className="btn primary" onClick={saveIdentity}
                  disabled={!(identity.name ?? '').trim()}>
                  <Icon name="save" size={13} /> {t('save')}
                </button>
              </div>
            </div>
          </SectionCard>
        )}

        {/* Telegram connection */}
        <SectionCard
          accent={tg.configured ? 'success' : 'warning'}
          icon="globe"
          title="اتصال تلگرام"
          subtitle="توکن ربات را از @BotFather بگیرید"
          actions={tg.configured
            ? <span className="badge success"><span className="dot" /> @{tg.username ?? '؟'}</span>
            : <span className="badge warning">تنظیم نشده</span>}
        >
          <div className="col">
            {tg.configured && (
              <Field label="توکن فعلی">
                <input className="input mono" dir="ltr" readOnly value={tg.masked ?? '••••'} />
              </Field>
            )}
            <Field
              label={tg.configured ? 'توکن جدید' : 'توکن ربات'}
              hint="ذخیره = تست واقعی با تلگرام + رمزنگاری AES-256. تغییر توکن حداکثر تا ۱۵ ثانیه روی ربات اعمال می‌شود."
            >
              <input className="input mono" dir="ltr" type="password"
                placeholder="123456789:AAF3..." value={tokenInput}
                onChange={(e) => setTokenInput(e.target.value)} />
            </Field>
            <div className="row">
              {tg.configured && (
                <button className="btn danger" onClick={() => setConfirmRemoveToken(true)}>
                  <Icon name="trash" size={13} /> حذف توکن
                </button>
              )}
              <div className="spacer" />
              <button className="btn primary" onClick={saveToken} disabled={tgBusy || !tokenInput.trim()}>
                <Icon name={tg.configured ? 'refresh' : 'plug'} size={13} />
                {tgBusy ? 'در حال بررسی…' : (tg.configured ? 'تغییر توکن' : 'اتصال ربات')}
              </button>
            </div>
          </div>
        </SectionCard>
      </div>

      {rows && rows.length === 0 ? (
        <EmptyState
          icon="mask"
          title="هیچ شخصیتی ساخته نشده است"
          text="با ساختن اولین شخصیت، لحن و رفتار ربات را تعیین کنید."
          action={<button className="btn primary" onClick={startCreate}>
            <Icon name="plus" size={14} /> ساخت شخصیت
          </button>}
        />
      ) : (
        <div className="grid grid-cards auto-cards">
          {(rows ?? []).map((p) => (
            <SectionCard
              key={p.id}
              className="hoverable"
              icon="mask"
              title={p.display_name}
              subtitle={<span className="ltr">{p.slug} · نسخهٔ {fmtNum(p.current_version)}</span>}
              actions={<IconButton icon="edit" title={t('edit')} onClick={() => startEdit(p)} />}
              footer={(
                <div className="row wrap tight">
                  <span className="badge primary">پروفایل: {PROFILES[p.model_profile_key] ?? p.model_profile_key ?? 'متعادل'}</span>
                  {p.is_default && <span className="badge success">پیش‌فرض</span>}
                </div>
              )}
            >
              <p className="muted sm clamp-2">{p.description || 'بدون توضیح'}</p>
            </SectionCard>
          ))}
        </div>
      )}

      {editing && form && (
        <Modal
          title={editing.id ? form.display_name || 'ویرایش شخصیت' : 'شخصیت جدید'}
          icon="mask"
          onClose={() => setEditing(null)}
          wide
          footer={(
            <>
              <span className="faint xs">{fmtNum(promptChars)} نویسه در پرامپت</span>
              <div className="spacer" />
              <button className="btn" onClick={() => setEditing(null)}>{t('cancel')}</button>
              <button className="btn primary" onClick={save}
                disabled={!form.slug.trim() || !form.display_name.trim()}>
                {editing.id ? t('save') : t('create')}
              </button>
            </>
          )}
        >
          <div className="studio">
            <div className="studio-main">
              <div className="grid grid-2">
                <Field label="نامک (slug)" required hint="شناسهٔ لاتین و بدون فاصله؛ بعد از ساخت قابل تغییر نیست.">
                  <input className="input mono" dir="ltr" value={form.slug} disabled={Boolean(editing.id)}
                    onChange={(e) => setF({ slug: e.target.value })} />
                </Field>
                <Field label="نام نمایشی" required>
                  <input className="input" value={form.display_name}
                    onChange={(e) => setF({ display_name: e.target.value })} />
                </Field>
                <Field label="توضیح کوتاه">
                  <input className="input" value={form.description}
                    onChange={(e) => setF({ description: e.target.value })} />
                </Field>
                <Field label="پروفایل مدل" hint="کیفیت و هزینهٔ پاسخ‌ها را تعیین می‌کند.">
                  <select className="select" value={form.model_profile_key}
                    onChange={(e) => setF({ model_profile_key: e.target.value })}>
                    {Object.entries(PROFILES).map(([k, label]) => (
                      <option key={k} value={k}>{label}</option>
                    ))}
                  </select>
                </Field>
              </div>

              <Field
                label="پرامپت سیستم"
                hint="هر ذخیره یک نسخهٔ جدید می‌سازد؛ می‌توانید بعداً به نسخه‌های پیشین برگردید."
              >
                <textarea className="textarea" rows={14} value={form.system_prompt}
                  onChange={(e) => setF({ system_prompt: e.target.value })}
                  placeholder="تو یک دستیار فارسی‌زبان هستی که…" />
              </Field>
            </div>

            <div className="studio-side">
              <div className="chat-panel">
                <div className="card-title"><Icon name="activity" size={14} /> تست زندهٔ گفت‌وگو</div>
                <div className="chat-log" ref={logRef}>
                  {chat.length === 0 && (
                    <span className="muted sm">پیامی بفرستید تا پاسخ این شخصیت را ببینید.</span>
                  )}
                  {chat.map((m, i) => (
                    <div key={i} className={`bubble ${m.role}`}>{m.content}</div>
                  ))}
                  {busy && <div className="bubble bot">در حال نوشتن…</div>}
                </div>
                <div className="chat-input-row">
                  <input className="input" placeholder="مثلاً: تو کی هستی؟" value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && sendTest()} />
                  <button className="btn primary" onClick={sendTest} disabled={busy || !chatInput.trim()}>
                    <Icon name="send" size={14} />
                  </button>
                </div>
              </div>
              {chat.length > 0 && (
                <button className="btn ghost sm block" onClick={() => setChat([])}>
                  <Icon name="trash" size={13} /> پاک کردن گفت‌وگو
                </button>
              )}
            </div>
          </div>
        </Modal>
      )}

      {confirmRemoveToken && (
        <ConfirmDialog
          title="حذف توکن تلگرام"
          message="با حذف توکن، ربات خاموش می‌شود (مگر اینکه توکن در فایل .env تنظیم شده باشد). ادامه می‌دهید؟"
          confirmLabel="حذف کن"
          onConfirm={removeToken}
          onClose={() => setConfirmRemoveToken(false)}
        />
      )}
    </div>
  );
}

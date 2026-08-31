import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../lib/api.js';
import { fmtNum, t } from '../lib/i18n.js';
import { Modal } from '../components/ui.jsx';
import { useStore } from '../state/store.jsx';

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
      toast(`✅ متصل شد: @${result.username} — ${result.note}`, 'success');
      setTokenInput('');
      setTg(await api('/settings/bot-token'));
    } catch (err) { toast(err.message, 'error'); }
    finally { setTgBusy(false); }
  };

  const removeToken = async () => {
    if (!window.confirm('توکن حذف شود؟ بات خاموش می‌شود (مگر اینکه توکن در .env باشد).')) return;
    try {
      await api('/settings/bot-token', { method: 'DELETE' });
      toast('توکن حذف شد', 'info');
      setTg(await api('/settings/bot-token'));
    } catch (err) { toast(err.message, 'error'); }
  };

  const saveIdentity = async () => {
    try {
      setIdentity(await api('/settings/bot-identity', { method: 'PUT', body: identity }));
      toast('نام ربات ذخیره شد — در گروه با «{name} خوبی؟» صدایت بزنید'.replace('{name}', identity.name), 'success');
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
      setChat((c) => [...c, { role: 'bot', content: `⚠️ ${err.message}` }]);
    } finally { setBusy(false); }
  };

  return (
    <div className="page">
      <div className="row">
        <h1 className="page-title">🎭 {t('personalities')}</h1>
        <div className="spacer" />
        <button className="btn primary" onClick={startCreate}>+ {t('add')}</button>
      </div>
      <p className="page-subtitle">{rows ? `${fmtNum(rows.length)} personality` : t('loading')} — هر گروه می‌تواند شخصیت مستقل داشته باشد</p>

      {/* Bot identity: the name users call in groups (spec §8) */}
      {identity && (
        <div className="card" style={{ marginBottom: 16, borderColor: 'var(--primary)' }}>
          <div className="card-title">🏷️ هویت ربات — اسمی که در گروه صدایش می‌زنند</div>
          <div className="row" style={{ flexWrap: 'wrap' }}>
            <div className="field" style={{ marginBottom: 0, width: 200 }}>
              <label>نام ربات</label>
              <input className="input" value={identity.name} onChange={(e) => setIdentity({ ...identity, name: e.target.value })} />
            </div>
            <div className="field" style={{ marginBottom: 0, flex: 1, minWidth: 220 }}>
              <label>بیو / معرفی کوتاه (اختیاری)</label>
              <input className="input" value={identity.bio ?? ''} onChange={(e) => setIdentity({ ...identity, bio: e.target.value })} />
            </div>
            <button className="btn primary" onClick={saveIdentity} disabled={!(identity.name ?? '').trim()}>💾 ذخیره</button>
          </div>
          <span className="faint mt" style={{ fontSize: 11, display: 'inline-block' }}>
            بعد از ذخیره، هر کسی در گروه بنویسد «{identity.name} خوبی؟» ربات مستقیماً به همان فرد با ریپلای جواب می‌دهد.
          </span>
        </div>
      )}

      {/* Telegram connection: set/test the bot token from the panel */}
      <div className="card" style={{ marginBottom: 16, borderColor: tg.configured ? 'var(--success)' : 'var(--warning)' }}>
        <div className="card-title">
          📡 اتصال تلگرام
          {tg.configured
            ? <span className="badge success">متصل: @{tg.username ?? '?'} ({tg.masked})</span>
            : <span className="badge warning">تنظیم نشده</span>}
        </div>
        <div className="row" style={{ flexWrap: 'wrap' }}>
          <input className="input" style={{ flex: 1, minWidth: 260 }} dir="ltr" type="password"
            placeholder="123456789:AAF3..." value={tokenInput}
            onChange={(e) => setTokenInput(e.target.value)} />
          <button className="btn primary" onClick={saveToken} disabled={tgBusy || !tokenInput.trim()}>
            {tgBusy ? '…' : (tg.configured ? '🔄 تغییر توکن' : '🔌 اتصال بات')}
          </button>
          {tg.configured && <button className="btn danger" onClick={removeToken}>🗑 حذف</button>}
        </div>
        <span className="faint mt" style={{ fontSize: 11, display: 'inline-block' }}>
          توکن را از @BotFather بگیرید. ذخیره = تست واقعی تلگرام + رمزنگاری AES-256. تغییر توکن تا ۱۵ ثانیه بعد خودکار روی بات اعمال می‌شود.
          بعد از اتصال، در تلگرام باز بات پیام بدهید — چت خصوصی فعال است.
        </span>
      </div>

      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))' }}>
        {(rows ?? []).map((p) => (
          <div key={p.id} className="card">
            <div className="row">
              <span style={{ fontSize: 22 }}>🎭</span>
              <div>
                <div style={{ fontWeight: 700 }}>{p.display_name}</div>
                <div className="faint mono" style={{ fontSize: 11 }}>{p.slug} · v{p.current_version}</div>
              </div>
              <div className="spacer" />
              <button className="btn sm" onClick={() => startEdit(p)}>✏️</button>
            </div>
            <p className="muted mt" style={{ fontSize: 12, minHeight: 32 }}>{p.description || '—'}</p>
            <div className="row" style={{ fontSize: 11 }}>
              <span className="badge primary">پروفایل: {p.model_profile_key ?? 'balanced'}</span>
              {p.is_default && <span className="badge success">پیش‌فرض</span>}
            </div>
          </div>
        ))}
        {rows && rows.length === 0 && (
          <div className="card"><div className="empty">
            <div className="empty-icon">🎭</div>
            <div className="empty-title">هیچ شخصیتی ساخته نشده است</div>
            <button className="btn primary mt" onClick={startCreate}>+ ساخت شخصیت</button>
          </div></div>
        )}
      </div>

      {editing && form && (
        <Modal title={editing.id ? `🎭 ${form.display_name}` : 'شخصیت جدید'} onClose={() => setEditing(null)} wide>
          <div className="studio">
            {/* Left: configuration */}
            <div>
              <div className="field"><label>نامک (slug)</label>
                <input className="input" dir="ltr" value={form.slug} disabled={Boolean(editing.id)}
                  onChange={(e) => setForm({ ...form, slug: e.target.value })} /></div>
              <div className="field"><label>نام نمایشی</label>
                <input className="input" value={form.display_name}
                  onChange={(e) => setForm({ ...form, display_name: e.target.value })} /></div>
              <div className="field"><label>توضیح</label>
                <input className="input" value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
              <div className="field"><label>پروفایل مدل</label>
                <select className="select" value={form.model_profile_key}
                  onChange={(e) => setForm({ ...form, model_profile_key: e.target.value })}>
                  {['fast', 'balanced', 'smart', 'reasoning', 'vision', 'cheap', 'premium', 'long_context'].map((k) => (
                    <option key={k} value={k}>{k}</option>
                  ))}
                </select></div>
            </div>

            {/* Center: prompt editor */}
            <div className="field">
              <label>پرامپت سیستم (System Prompt) — نسخه‌بندی خودکار</label>
              <textarea className="textarea" rows={14} value={form.system_prompt}
                onChange={(e) => setForm({ ...form, system_prompt: e.target.value })}
                placeholder="تو یک دستیار فارسی‌زبان هستی که…" />
              <span className="faint" style={{ fontSize: 11 }}>
                هر ذخیره یک نسخه‌ی جدید ایجاد می‌کند؛ می‌توانید بعداً به نسخه‌های قبلی برگردید.
              </span>
            </div>

            {/* Right: live test chat */}
            <div className="card chat-panel">
              <div className="card-title">🧪 تست زنده</div>
              <div className="chat-log" ref={logRef}>
                {chat.length === 0 && <div className="muted" style={{ fontSize: 12 }}>پیامی بفرستید تا پاسخ این شخصیت را ببینید.</div>}
                {chat.map((m, i) => (
                  <div key={i} className={`bubble ${m.role}`}>{m.content}</div>
                ))}
                {busy && <div className="bubble bot">…</div>}
              </div>
              <div className="chat-input-row">
                <input className="input" placeholder="مثلاً: تو کی هستی؟" value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && sendTest()} />
                <button className="btn primary" onClick={sendTest} disabled={busy}>➤</button>
              </div>
            </div>
          </div>
          <div className="row" style={{ justifyContent: 'flex-end', marginTop: 14 }}>
            <button className="btn" onClick={() => setEditing(null)}>{t('cancel')}</button>
            <button className="btn primary" onClick={save} disabled={!form.slug || !form.display_name}>{t('save')}</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

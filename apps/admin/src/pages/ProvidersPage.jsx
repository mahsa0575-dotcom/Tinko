import { useCallback, useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { fmtNum, t } from '../lib/i18n.js';
import { DataTable, StatusBadge, Modal } from '../components/ui.jsx';
import { useStore } from '../state/store.jsx';
import { Icon } from '../components/icons.jsx';

/** Providers page: CRUD, API-key pool, connection test, custom HTTP builder. */
export function ProvidersPage() {
  const { toast } = useStore();
  const [rows, setRows] = useState(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState(null);
  const [keysFor, setKeysFor] = useState(null);
  const [keys, setKeys] = useState([]);
  const [newKey, setNewKey] = useState('');
  const [testing, setTesting] = useState(null);

  const load = useCallback(async () => {
    try { setRows(await api('/providers')); }
    catch (err) { toast(err.message, 'error'); }
  }, [toast]);
  useEffect(() => { load(); }, [load]);

  const startCreate = () => {
    setForm({
      slug: '', display_name: '', kind: 'openai_compatible', base_url: '',
      timeout_ms: 60000, max_retries: 2,
      config: { chatPath: '/chat/completions', responsePath: '', auth: { type: 'bearer' } },
    });
    setCreating(true);
  };

  const save = async () => {
    try {
      const config = { ...form.config };
      if (!config.responsePath) delete config.responsePath;
      await api('/providers', { method: 'POST', body: { ...form, config } });
      toast(t('saved'), 'success');
      setCreating(false);
      load();
    } catch (err) { toast(err.message, 'error'); }
  };

  const remove = async (provider) => {
    if (!window.confirm(`${t('confirm_delete')} (${provider.display_name})`)) return;
    try {
      await api(`/providers/${provider.id}`, { method: 'DELETE' });
      toast(t('deleted'), 'success');
      load();
    } catch (err) { toast(err.message, 'error'); }
  };

  const testProvider = async (provider) => {
    setTesting(provider.id);
    try {
      const result = await api(`/providers/${provider.id}/test`, { method: 'POST', body: {} });
      toast(result.ok ? `متصل شد (${fmtNum(result.latencyMs)}ms)` : `${result.error}`, result.ok ? 'success' : 'error');
    } catch (err) { toast(err.message, 'error'); }
    finally { setTesting(null); }
  };

  const openKeys = async (provider) => {
    setKeysFor(provider);
    setNewKey('');
    try { setKeys(await api(`/providers/${provider.id}/keys`)); }
    catch (err) { toast(err.message, 'error'); }
  };
  const addKey = async () => {
    if (!newKey.trim()) return;
    try {
      await api(`/providers/${keysFor.id}/keys`, { method: 'POST', body: { secret: newKey, label: '' } });
      setNewKey('');
      setKeys(await api(`/providers/${keysFor.id}/keys`));
      toast('کلید ذخیره شد (رمزنگاری‌شده)', 'success');
    } catch (err) { toast(err.message, 'error'); }
  };
  const toggleKey = async (key) => {
    try {
      await api(`/providers/${keysFor.id}/keys/${key.id}`, { method: 'PATCH', body: { status: key.status === 'active' ? 'disabled' : 'active' } });
      setKeys(await api(`/providers/${keysFor.id}/keys`));
    } catch (err) { toast(err.message, 'error'); }
  };

  return (
    <div className="page">
      <div className="row">
        <h1 className="page-title"><span className="title-icon"><Icon name="plug" size={20} /></span>{t('providers')}</h1>
        <div className="spacer" />
        <button className="btn primary" onClick={startCreate}>+ {t('add')}</button>
      </div>
      <p className="page-subtitle">OpenAI، Anthropic، DeepSeek، Groq، OpenRouter، Ollama یا هر API سفارشی دیگر</p>

      <DataTable loading={!rows} rows={rows} emptyText="هیچ تأمین‌کننده‌ای پیکربندی نشده است"
        columns={[
          { key: 'display_name', label: 'Name', render: (p) => (
            <div style={{ fontWeight: 600 }}>{p.display_name}<div className="faint mono" style={{ fontSize: 11 }}>{p.slug} · {p.kind}</div></div>
          )},
          { key: 'base_url', label: 'Base URL', render: (p) => <span className="mono" style={{ fontSize: 11 }}>{p.base_url ?? '—'}</span> },
          { key: 'health', label: 'Health', render: (p) => <StatusBadge value={p.health} /> },
          { key: 'status', label: t('status'), render: (p) => <StatusBadge value={p.status} /> },
          { key: 'actions', label: t('actions'), sortable: false, render: (p) => (
            <div className="row">
              <button className="btn sm" onClick={() => testProvider(p)} disabled={testing === p.id}>
                {testing === p.id ? '…' : <><Icon name="zap" size={13} />تست</>}
              </button>
              <button className="btn sm" onClick={() => openKeys(p)}><Icon name="key" size={13} /> کلیدها</button>
              <button className="btn sm danger" onClick={() => remove(p)}><Icon name="trash" size={13} /></button>
            </div>
          )},
        ]}
      />

      {creating && (
        <Modal title="تأمین‌کننده‌ی جدید" onClose={() => setCreating(false)} wide>
          <div className="grid grid-2">
            <div className="field"><label>نامک (slug)</label>
              <input className="input" dir="ltr" value={form.slug}
                onChange={(e) => setForm({ ...form, slug: e.target.value })} placeholder="my-provider" /></div>
            <div className="field"><label>نام نمایشی</label>
              <input className="input" value={form.display_name}
                onChange={(e) => setForm({ ...form, display_name: e.target.value })} /></div>
            <div className="field"><label>نوع</label>
              <select className="select" value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })}>
                <option value="openai_compatible">OpenAI-Compatible</option>
                <option value="anthropic">Anthropic</option>
                <option value="custom_http">Custom HTTP (پیشرفته)</option>
                <option value="mock">Mock (تست)</option>
              </select></div>
            <div className="field"><label>Base URL</label>
              <input className="input" dir="ltr" value={form.base_url}
                onChange={(e) => setForm({ ...form, base_url: e.target.value })}
                placeholder="https://api.example.com/v1" /></div>
            <div className="field"><label>Timeout (ms)</label>
              <input className="input" type="number" value={form.timeout_ms}
                onChange={(e) => setForm({ ...form, timeout_ms: Number(e.target.value) })} /></div>
            <div className="field"><label>Max retries</label>
              <input className="input" type="number" value={form.max_retries}
                onChange={(e) => setForm({ ...form, max_retries: Number(e.target.value) })} /></div>
          </div>

          {form.kind === 'custom_http' && (
            <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12, marginTop: 6 }}>
              <div className="grid grid-2">
                <div className="field"><label>Endpoint</label>
                  <input className="input" dir="ltr" value={form.config.endpoint ?? ''}
                    onChange={(e) => setForm({ ...form, config: { ...form.config, endpoint: e.target.value } })}
                    placeholder="/chat" /></div>
                <div className="field"><label>نوع احراز هویت</label>
                  <select className="select" value={form.config.auth?.type ?? 'bearer'}
                    onChange={(e) => setForm({ ...form, config: { ...form.config, auth: { ...form.config.auth, type: e.target.value } } })}>
                    <option value="bearer">Bearer</option><option value="api_key_header">API Key Header</option>
                    <option value="api_key_query">API Key Query</option><option value="basic">Basic</option>
                    <option value="none">بدون احراز</option>
                  </select></div>
                {form.config.auth?.type === 'api_key_header' && (
                  <div className="field"><label>نام هدر</label>
                    <input className="input" dir="ltr" value={form.config.auth?.headerName ?? ''}
                      onChange={(e) => setForm({ ...form, config: { ...form.config, auth: { ...form.config.auth, headerName: e.target.value } } })}
                      placeholder="x-api-key" /></div>
                )}
                <div className="field"><label>مسیر پاسخ (JSON Path)</label>
                  <input className="input" dir="ltr" value={form.config.responsePath ?? ''}
                    onChange={(e) => setForm({ ...form, config: { ...form.config, responsePath: e.target.value } })}
                    placeholder="data.message.content" /></div>
              </div>
              <div className="field"><label>قالب بدنه‌ی درخواست (Request Template)</label>
                <textarea className="textarea mono" dir="ltr" rows={5} value={form.config.bodyTemplate ?? ''}
                  onChange={(e) => setForm({ ...form, config: { ...form.config, bodyTemplate: e.target.value } })}
                  placeholder={'{"model":"{{model}}","messages":{{messages}},"temperature":{{temperature}}}'} />
                <span className="faint" style={{ fontSize: 11 }}>
                  متغیرهای مجاز: api_key · model · messages · system_prompt · temperature · max_tokens · user_id · group_id · conversation_id · language
                </span>
              </div>
            </div>
          )}

          <div className="row" style={{ justifyContent: 'flex-end' }}>
            <button className="btn" onClick={() => setCreating(false)}>{t('cancel')}</button>
            <button className="btn primary" onClick={save} disabled={!form.slug || !form.display_name}>{t('save')}</button>
          </div>
        </Modal>
      )}

      {keysFor && (
        <Modal title={`کلیدهای ${keysFor.display_name}`} onClose={() => setKeysFor(null)}>
          <div className="row">
            <input className="input" dir="ltr" type="password" placeholder="sk-... یا کلید API"
              value={newKey} onChange={(e) => setNewKey(e.target.value)} />
            <button className="btn primary" onClick={addKey}>{t('add')}</button>
          </div>
          <div className="mt">
            {keys.length === 0 && <div className="muted">هیچ کلیدی ثبت نشده است</div>}
            {keys.map((k) => (
              <div key={k.id} className="row" style={{ justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                <span className="mono">#{k.id} {k.label}</span>
                <div className="row">
                  <StatusBadge value={k.status} />
                  <button className="btn sm" onClick={() => toggleKey(k)}>{k.status === 'active' ? 'غیرفعال' : 'فعال'}</button>
                </div>
              </div>
            ))}
          </div>
          <p className="faint mt" style={{ fontSize: 12 }}>
            کلیدها با AES-256-GCM رمزنگاری و فقط به‌صورت ماسک‌شده نمایش داده می‌شوند. چرخش خودکار: کم‌استفاده‌ترین کلید فعال بعدی است.
          </p>
        </Modal>
      )}
    </div>
  );
}

import { useCallback, useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { fmtNum, t } from '../lib/i18n.js';
import {
  DataTable, StatusBadge, Modal, PageHeader, Field, IconButton, List, ListRow,
  EmptyState, Notice, Spinner, SectionCard, ConfirmDialog,
} from '../components/ui.jsx';
import { useStore } from '../state/store.jsx';
import { Icon } from '../components/icons.jsx';

const KIND_LABEL = {
  openai_compatible: 'سازگار با OpenAI',
  anthropic: 'Anthropic',
  custom_http: 'HTTP سفارشی',
  mock: 'آزمایشی (Mock)',
};

/** Providers page: CRUD, API-key pool, connection test, custom HTTP builder. */
export function ProvidersPage() {
  const { toast } = useStore();
  const [rows, setRows] = useState(null);
  const [creating, setCreating] = useState(false);
  const [editingProvider, setEditingProvider] = useState(null);
  const [form, setForm] = useState(null);
  const [keysFor, setKeysFor] = useState(null);
  const [keys, setKeys] = useState([]);
  const [newKey, setNewKey] = useState('');
  const [testing, setTesting] = useState(null);
  const [confirm, setConfirm] = useState(null);

  const load = useCallback(async () => {
    try { setRows(await api('/providers')); } catch (err) { toast(err.message, 'error'); }
  }, [toast]);
  useEffect(() => { load(); }, [load]);

  const closeForm = () => { setCreating(false); setEditingProvider(null); };

  const startCreate = () => {
    setForm({
      slug: '', display_name: '', kind: 'openai_compatible', base_url: '',
      timeout_ms: 60000, max_retries: 2,
      config: { chatPath: '/v1/chat/completions', responsePath: '', auth: { type: 'bearer' } },
    });
    setCreating(true);
  };

  const startEdit = (provider) => {
    const config = typeof provider.config === 'string' ? JSON.parse(provider.config || '{}') : (provider.config ?? {});
    setForm({
      slug: provider.slug, display_name: provider.display_name, kind: provider.kind,
      base_url: provider.base_url ?? '', timeout_ms: provider.timeout_ms ?? 60000,
      max_retries: provider.max_retries ?? 2,
      config: { chatPath: '/v1/chat/completions', auth: { type: 'bearer' }, ...config },
    });
    setEditingProvider(provider);
    setCreating(true);
  };

  const save = async () => {
    try {
      const config = { ...form.config };
      if (!config.responsePath) delete config.responsePath;
      await api(editingProvider ? `/providers/${editingProvider.id}` : '/providers', {
        method: editingProvider ? 'PATCH' : 'POST', body: { ...form, config },
      });
      toast(t('saved'), 'success');
      closeForm();
      load();
    } catch (err) { toast(err.message, 'error'); }
  };

  const remove = async (provider) => {
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
      toast(result.ok ? `متصل شد (${fmtNum(result.latencyMs)}ms)` : result.error, result.ok ? 'success' : 'error');
    } catch (err) { toast(err.message, 'error'); } finally { setTesting(null); }
  };

  const openKeys = async (provider) => {
    setKeysFor(provider);
    setNewKey('');
    try { setKeys(await api(`/providers/${provider.id}/keys`)); } catch (err) { toast(err.message, 'error'); }
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
      await api(`/providers/${keysFor.id}/keys/${key.id}`, {
        method: 'PATCH', body: { status: key.status === 'active' ? 'disabled' : 'active' },
      });
      setKeys(await api(`/providers/${keysFor.id}/keys`));
    } catch (err) { toast(err.message, 'error'); }
  };

  const setCfg = (patch) => setForm((f) => ({ ...f, config: { ...f.config, ...patch } }));
  const setAuth = (patch) => setCfg({ auth: { ...form.config.auth, ...patch } });

  return (
    <div className="page">
      <PageHeader
        icon="plug"
        title={t('providers')}
        subtitle="OpenAI، Anthropic، DeepSeek، Groq، OpenRouter، Ollama یا هر API سفارشی دیگر را متصل کنید"
        actions={
          <>
            <button className="btn sm" onClick={load}><Icon name="refresh" size={13} />{t('refresh')}</button>
            <button className="btn sm primary" onClick={startCreate}><Icon name="plus" size={13} />{t('add')}</button>
          </>
        }
      />

      <DataTable
        loading={!rows}
        rows={rows}
        emptyIcon="plug"
        emptyText="هیچ تأمین‌کننده‌ای پیکربندی نشده است"
        columns={[
          {
            key: 'display_name',
            label: t('col_name'),
            render: (p) => (
              <div className="col tight">
                <span className="cell-strong">{p.display_name}</span>
                <span className="faint mono xs">{p.slug} · {KIND_LABEL[p.kind] ?? p.kind}</span>
              </div>
            ),
          },
          {
            key: 'base_url',
            label: t('col_base_url'),
            render: (p) => <span className="mono xs ltr cell-clip">{p.base_url ?? '—'}</span>,
          },
          { key: 'health', label: t('col_health'), render: (p) => <StatusBadge value={p.health} /> },
          { key: 'status', label: t('status'), render: (p) => <StatusBadge value={p.status} /> },
          {
            key: 'actions',
            label: t('actions'),
            sortable: false,
            cellClass: 'actions-cell',
            render: (p) => (
              <div className="row tight">
                <button className="btn xs" onClick={() => testProvider(p)} disabled={testing === p.id}>
                  {testing === p.id ? <Spinner size={12} /> : <Icon name="zap" size={12} />}
                  {t('test')}
                </button>
                <button className="btn xs" onClick={() => openKeys(p)}>
                  <Icon name="key" size={12} />کلیدها
                </button>
                <IconButton small icon="edit" title={t('edit')} onClick={() => startEdit(p)} />
                <IconButton small danger icon="trash" title={t('delete')}
                  onClick={() => setConfirm({
                    title: 'حذف تأمین‌کننده',
                    message: `آیا از حذف «${p.display_name}» مطمئن هستید؟ مدل‌ها و کلیدهای وابسته نیز تحت تأثیر قرار می‌گیرند.`,
                    run: () => remove(p),
                  })} />
              </div>
            ),
          },
        ]}
      />

      {creating && (
        <Modal
          wide
          icon="plug"
          title={editingProvider ? `ویرایش «${editingProvider.display_name}»` : 'تأمین‌کنندهٔ جدید'}
          onClose={closeForm}
          footer={
            <>
              <div className="spacer" />
              <button className="btn" onClick={closeForm}>{t('cancel')}</button>
              <button className="btn primary" onClick={save} disabled={!form.slug || !form.display_name}>
                <Icon name="save" size={14} />{t('save')}
              </button>
            </>
          }
        >
          <div className="grid grid-2">
            <Field label="نامک (slug)" required hint="شناسهٔ یکتا و انگلیسی">
              <input className="input mono" dir="ltr" value={form.slug} placeholder="my-provider"
                onChange={(e) => setForm({ ...form, slug: e.target.value })} />
            </Field>
            <Field label="نام نمایشی" required>
              <input className="input" value={form.display_name}
                onChange={(e) => setForm({ ...form, display_name: e.target.value })} />
            </Field>
            <Field label="نوع تأمین‌کننده">
              <select className="select" value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })}>
                <option value="openai_compatible">سازگار با OpenAI</option>
                <option value="anthropic">Anthropic</option>
                <option value="custom_http">HTTP سفارشی (پیشرفته)</option>
                <option value="mock">آزمایشی (Mock)</option>
              </select>
            </Field>
            <Field label="آدرس پایه (Base URL)">
              <input className="input mono" dir="ltr" value={form.base_url} placeholder="https://api.example.com/v1"
                onChange={(e) => setForm({ ...form, base_url: e.target.value })} />
            </Field>
            <Field label="مهلت پاسخ (میلی‌ثانیه)">
              <input className="input" type="number" value={form.timeout_ms}
                onChange={(e) => setForm({ ...form, timeout_ms: Number(e.target.value) })} />
            </Field>
            <Field label="حداکثر تلاش مجدد">
              <input className="input" type="number" value={form.max_retries}
                onChange={(e) => setForm({ ...form, max_retries: Number(e.target.value) })} />
            </Field>
          </div>

          {form.kind === 'openai_compatible' && (
            <Field label="مسیر Chat Completion" hint="اگر آدرس پایه شامل /v1 نیست، مقدار پیش‌فرض را نگه دارید.">
              <input className="input mono" dir="ltr" value={form.config.chatPath ?? '/v1/chat/completions'}
                placeholder="/v1/chat/completions" onChange={(e) => setCfg({ chatPath: e.target.value })} />
            </Field>
          )}

          {form.kind === 'custom_http' && (
            <SectionCard icon="code" title="پیکربندی HTTP سفارشی" subtitle="ساختار درخواست و پاسخ را دقیق تعیین کنید">
              <div className="grid grid-2">
                <Field label="Endpoint">
                  <input className="input mono" dir="ltr" value={form.config.endpoint ?? ''} placeholder="/chat"
                    onChange={(e) => setCfg({ endpoint: e.target.value })} />
                </Field>
                <Field label="نوع احراز هویت">
                  <select className="select" value={form.config.auth?.type ?? 'bearer'}
                    onChange={(e) => setAuth({ type: e.target.value })}>
                    <option value="bearer">Bearer Token</option>
                    <option value="api_key_header">کلید در هدر</option>
                    <option value="api_key_query">کلید در Query String</option>
                    <option value="basic">Basic Auth</option>
                    <option value="none">بدون احراز هویت</option>
                  </select>
                </Field>
                {form.config.auth?.type === 'api_key_header' && (
                  <Field label="نام هدر">
                    <input className="input mono" dir="ltr" value={form.config.auth?.headerName ?? ''}
                      placeholder="x-api-key" onChange={(e) => setAuth({ headerName: e.target.value })} />
                  </Field>
                )}
                <Field label="مسیر پاسخ (JSON Path)">
                  <input className="input mono" dir="ltr" value={form.config.responsePath ?? ''}
                    placeholder="data.message.content" onChange={(e) => setCfg({ responsePath: e.target.value })} />
                </Field>
              </div>
              <Field label="قالب بدنهٔ درخواست">
                <textarea className="textarea mono" dir="ltr" rows={5} value={form.config.bodyTemplate ?? ''}
                  placeholder={'{"model":"{{model}}","messages":{{messages}},"temperature":{{temperature}}}'}
                  onChange={(e) => setCfg({ bodyTemplate: e.target.value })} />
              </Field>
              <Notice kind="info" title="متغیرهای قابل استفاده">
                <span className="mono xs ltr">
                  api_key · model · messages · system_prompt · temperature · max_tokens · user_id · group_id ·
                  conversation_id · language
                </span>
              </Notice>
            </SectionCard>
          )}
        </Modal>
      )}

      {keysFor && (
        <Modal
          icon="key"
          title={`کلیدهای «${keysFor.display_name}»`}
          onClose={() => setKeysFor(null)}
          footer={<><div className="spacer" /><button className="btn" onClick={() => setKeysFor(null)}>{t('close')}</button></>}
        >
          <Field label="افزودن کلید جدید" hint="کلید پس از ذخیره دیگر قابل مشاهده نیست.">
            <div className="row tight">
              <input className="input mono" dir="ltr" type="password" placeholder="sk-… یا کلید API"
                value={newKey} onChange={(e) => setNewKey(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && addKey()} />
              <button className="btn primary" onClick={addKey} disabled={!newKey.trim()}>
                <Icon name="plus" size={14} />{t('add')}
              </button>
            </div>
          </Field>

          {keys.length === 0 ? (
            <EmptyState icon="key" title="هیچ کلیدی ثبت نشده است"
              text="برای فعال شدن این تأمین‌کننده حداقل یک کلید API لازم است." />
          ) : (
            <List bordered>
              {keys.map((k) => (
                <ListRow
                  key={k.id}
                  icon="key"
                  title={k.label || `کلید #${k.id}`}
                  subtitle={k.masked ? <span className="mono">{k.masked}</span> : `شناسه ${k.id}`}
                  end={
                    <>
                      <StatusBadge value={k.status} />
                      <button className="btn xs" onClick={() => toggleKey(k)}>
                        {k.status === 'active' ? 'غیرفعال کن' : 'فعال کن'}
                      </button>
                    </>
                  }
                />
              ))}
            </List>
          )}

          <Notice kind="info" title="امنیت کلیدها">
            کلیدها با AES-256-GCM رمزنگاری شده و فقط به‌صورت ماسک‌شده نمایش داده می‌شوند.
            چرخش خودکار: کم‌استفاده‌ترین کلید فعال، انتخاب بعدی است.
          </Notice>
        </Modal>
      )}

      {confirm && (
        <ConfirmDialog
          title={confirm.title}
          message={confirm.message}
          confirmLabel="حذف کن"
          onConfirm={confirm.run}
          onClose={() => setConfirm(null)}
        />
      )}
    </div>
  );
}

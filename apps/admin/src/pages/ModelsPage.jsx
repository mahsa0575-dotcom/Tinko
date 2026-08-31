import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api.js';
import { fmtNum, t } from '../lib/i18n.js';
import { DataTable, Modal, StatusBadge, ConfirmDialog, Spinner, PageHeader } from '../components/ui.jsx';
import { useStore } from '../state/store.jsx';
import { Icon } from '../components/icons.jsx';

/** Capabilities the router can filter on — kept in sync with the AI package. */
const CAPABILITIES = [
  { key: 'chat', label: 'گفتگو' },
  { key: 'streaming', label: 'استریم' },
  { key: 'tools', label: 'ابزار / Function' },
  { key: 'vision', label: 'تصویر' },
  { key: 'audio', label: 'صدا' },
  { key: 'embeddings', label: 'Embedding' },
  { key: 'json', label: 'JSON Mode' },
];

const EMPTY_MODEL = {
  identifier: '', display_name: '', description: '',
  context_window: '', max_output: '', input_price: '', output_price: '',
  capabilities: ['chat', 'streaming'], priority: 100, status: 'active',
};

/** null/''/NaN → null, otherwise a finite number. */
function num(v) {
  if (v === '' || v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** Model registry + logical profile mapping. */
export function ModelsPage() {
  const { toast } = useStore();
  const [models, setModels] = useState(null);
  const [providers, setProviders] = useState([]);
  const [profiles, setProfiles] = useState(null);

  // manual add / edit
  const [modelForm, setModelForm] = useState(null);   // { ...fields, provider_id, _id? }
  // discovery
  const [discovery, setDiscovery] = useState(null);   // { providerId, loading, data, picked:Set, query, importing }
  const [confirmDel, setConfirmDel] = useState(null);
  // profiles
  const [editingProfile, setEditingProfile] = useState(null);
  const [profileForm, setProfileForm] = useState(null);
  const [routeDebug, setRouteDebug] = useState(null);

  const load = useCallback(async () => {
    try {
      const [m, p, pr] = await Promise.all([api('/models'), api('/providers'), api('/model-profiles')]);
      setModels(m); setProviders(p); setProfiles(pr);
    } catch (err) { toast(err.message, 'error'); }
  }, [toast]);
  useEffect(() => { load(); }, [load]);

  // ---------------- model discovery ----------------

  const openDiscovery = () => {
    if (!providers.length) { toast('ابتدا یک تأمین‌کننده بسازید', 'error'); return; }
    const providerId = providers[0].id;
    setDiscovery({ providerId, loading: false, data: null, picked: new Set(), query: '', importing: false });
  };

  const fetchModels = useCallback(async (providerId) => {
    setDiscovery((d) => ({ ...d, providerId, loading: true, data: null, picked: new Set(), query: '' }));
    try {
      const data = await api(`/providers/${providerId}/models/discover`);
      setDiscovery((d) => (d ? { ...d, loading: false, data } : d));
      if (data.supported) toast(`${fmtNum(data.count)} مدل از تأمین‌کننده دریافت شد`, 'success');
      else toast(data.reason || 'این تأمین‌کننده فهرست مدل‌ها را ارائه نمی‌دهد', 'info');
    } catch (err) {
      setDiscovery((d) => (d ? { ...d, loading: false, data: { supported: false, reason: err.message, models: [], count: 0 } } : d));
      toast(err.message, 'error');
    }
  }, [toast]);

  const discovered = discovery?.data?.models ?? [];
  const filteredDiscovered = useMemo(() => {
    const q = (discovery?.query ?? '').trim().toLowerCase();
    if (!q) return discovered;
    return discovered.filter((m) =>
      m.identifier.toLowerCase().includes(q) || (m.display_name ?? '').toLowerCase().includes(q));
  }, [discovered, discovery?.query]);

  const togglePick = (identifier) => setDiscovery((d) => {
    const picked = new Set(d.picked);
    if (picked.has(identifier)) picked.delete(identifier); else picked.add(identifier);
    return { ...d, picked };
  });
  const pickAllVisible = () => setDiscovery((d) => {
    const selectable = filteredDiscovered.filter((m) => !m.registered).map((m) => m.identifier);
    const allPicked = selectable.length > 0 && selectable.every((id) => d.picked.has(id));
    const picked = new Set(d.picked);
    for (const id of selectable) { if (allPicked) picked.delete(id); else picked.add(id); }
    return { ...d, picked };
  });

  const importPicked = async () => {
    const items = discovered.filter((m) => discovery.picked.has(m.identifier)).map((m, i) => ({
      identifier: m.identifier,
      display_name: m.display_name || m.identifier,
      description: m.description ?? '',
      context_window: m.context_window ?? null,
      max_output: m.max_output ?? null,
      input_price: m.input_price ?? null,
      output_price: m.output_price ?? null,
      capabilities: m.capabilities?.length ? m.capabilities : ['chat'],
      priority: 100 + i,
    }));
    if (!items.length) return;
    setDiscovery((d) => ({ ...d, importing: true }));
    try {
      const res = await api(`/providers/${discovery.providerId}/models/import`, { method: 'POST', body: { models: items } });
      toast(`${fmtNum(res.imported)} مدل ثبت شد${res.failed?.length ? ` — ${res.failed.length} ناموفق` : ''}`,
        res.failed?.length ? 'info' : 'success');
      setDiscovery(null);
      load();
    } catch (err) {
      toast(err.message, 'error');
      setDiscovery((d) => (d ? { ...d, importing: false } : d));
    }
  };

  /** Prefill the manual form from a discovered row (single, editable import). */
  const importOne = (m) => {
    setModelForm({
      provider_id: discovery.providerId,
      identifier: m.identifier,
      display_name: m.display_name || m.identifier,
      description: m.description ?? '',
      context_window: m.context_window ?? '',
      max_output: m.max_output ?? '',
      input_price: m.input_price ?? '',
      output_price: m.output_price ?? '',
      capabilities: m.capabilities?.length ? m.capabilities : ['chat'],
      priority: 100, status: 'active',
    });
    setDiscovery(null);
  };

  // ---------------- model CRUD ----------------

  const startAddModel = () => {
    if (!providers.length) { toast('ابتدا یک تأمین‌کننده بسازید', 'error'); return; }
    setModelForm({ ...EMPTY_MODEL, provider_id: providers[0].id });
  };
  const startEditModel = (m) => setModelForm({
    _id: m.id, provider_id: m.provider_id,
    identifier: m.identifier, display_name: m.display_name ?? '', description: m.description ?? '',
    context_window: m.context_window ?? '', max_output: m.max_output ?? '',
    input_price: m.input_price ?? '', output_price: m.output_price ?? '',
    capabilities: m.capabilities ?? ['chat'], priority: m.priority ?? 100, status: m.status ?? 'active',
  });

  const saveModel = async () => {
    const f = modelForm;
    const payload = {
      display_name: f.display_name || f.identifier,
      description: f.description || '',
      context_window: num(f.context_window),
      max_output: num(f.max_output),
      input_price: num(f.input_price),
      output_price: num(f.output_price),
      capabilities: f.capabilities.length ? f.capabilities : ['chat'],
      priority: num(f.priority) ?? 100,
      status: f.status,
    };
    try {
      if (f._id) await api(`/models/${f._id}`, { method: 'PATCH', body: payload });
      else await api(`/providers/${f.provider_id}/models`, { method: 'POST', body: { ...payload, identifier: f.identifier.trim() } });
      toast(t('saved'), 'success'); setModelForm(null); load();
    } catch (err) { toast(err.message, 'error'); }
  };

  const deleteModel = async (force = false) => {
    try {
      await api(`/models/${confirmDel.id}${force ? '?force=1' : ''}`, { method: 'DELETE' });
      toast('مدل حذف شد', 'success'); setConfirmDel(null); load();
    } catch (err) {
      // The API refuses when the model is still wired into a profile; offer force.
      if (!force && /force=1/.test(err.message)) { setConfirmDel({ ...confirmDel, blocker: err.message }); return; }
      toast(err.message, 'error');
    }
  };

  const toggleCap = (key) => setModelForm((f) => ({
    ...f,
    capabilities: f.capabilities.includes(key) ? f.capabilities.filter((c) => c !== key) : [...f.capabilities, key],
  }));

  // ---------------- profiles ----------------

  const editProfile = (profile) => {
    setEditingProfile(profile);
    setProfileForm({ key: profile.key, name: profile.name, models: (profile.models ?? []).filter((m) => m.model_id).map((m) => m.model_id) });
  };
  const saveProfile = async () => {
    try {
      await api(`/model-profiles/${profileForm.key}`, { method: 'PUT', body: { name: profileForm.name, models: profileForm.models.filter(Boolean).map(Number) } });
      toast(t('saved'), 'success'); setEditingProfile(null); load();
    } catch (err) { toast(err.message, 'error'); }
  };
  const runRouteDebug = async () => {
    try { setRouteDebug(await api('/debug/route', { method: 'POST', body: { profileKey: editingProfile?.key ?? 'balanced', require: [] } })); }
    catch (err) { toast(err.message, 'error'); }
  };

  /** Render one entry of a profile chain using the model's real identity. */
  const chainLabel = (m) => m.display_name || m.identifier || `#${m.model_id}`;

  const pickedCount = discovery?.picked.size ?? 0;
  const providerOf = (id) => providers.find((p) => p.id === id);

  return (
    <div className="page">
      <PageHeader icon="models" title={t('models')}
        subtitle="ابتدا فهرست مدل‌ها را از تأمین‌کننده دریافت کنید، سپس شناسه‌های موردنظر را ثبت کنید"
        actions={(
          <>
            <button className="btn primary" onClick={openDiscovery}>
              <Icon name="download" size={14} /> دریافت لیست مدل‌ها
            </button>
            <button className="btn" onClick={startAddModel}><Icon name="plus" size={14} /> ثبت دستی</button>
            <button className="btn ghost" onClick={runRouteDebug}><Icon name="search" size={14} /> دیباگر روتینگ</button>
          </>
        )}
      />

      <DataTable loading={!models} rows={models} emptyText="هیچ مدلی ثبت نشده است — از «دریافت لیست مدل‌ها» شروع کنید"
        columns={[
          { key: 'display_name', label: 'مدل', sortable: true, render: (m) => (
            <div>
              <div style={{ fontWeight: 600 }}>{m.display_name || m.identifier}</div>
              <div className="faint mono" style={{ fontSize: 11 }} dir="ltr">{m.provider_slug} / {m.identifier}</div>
            </div>
          )},
          { key: 'context_window', label: 'کانتکست', sortable: true, render: (m) => m.context_window ? fmtNum(m.context_window) : '—' },
          { key: 'capabilities', label: 'قابلیت‌ها', render: (m) => (
            <div className="row" style={{ flexWrap: 'wrap', gap: 4 }}>
              {(m.capabilities ?? []).map((c) => <span key={c} className="badge neutral">{c}</span>)}
            </div>
          )},
          { key: 'priority', label: 'اولویت', sortable: true },
          { key: 'status', label: t('status'), sortable: true, render: (m) => <StatusBadge value={m.status} /> },
          { key: '_actions', label: '', render: (m) => (
            <div className="row" style={{ gap: 4, justifyContent: 'flex-end' }}>
              <button className="btn sm ghost" title="ویرایش" onClick={() => startEditModel(m)}><Icon name="edit" size={13} /></button>
              <button className="btn sm ghost" title="حذف" onClick={() => setConfirmDel(m)}><Icon name="trash" size={13} /></button>
            </div>
          )},
        ]}
      />

      <h2 className="section-title"><Icon name="models" size={16} /> پروفایل‌های منطقی</h2>
      <div className="grid auto-cards">
        {(profiles ?? []).map((p) => {
          const chain = (p.models ?? []).filter((m) => m.model_id);
          return (
            <div key={p.id} className="card">
              <div className="row">
                <Icon name="models" size={18} />
                <div style={{ fontWeight: 700 }}>{p.name}</div>
                <span className="badge neutral mono">{p.key}</span>
                <div className="spacer" />
                <button className="btn sm ghost" onClick={() => editProfile(p)}><Icon name="edit" size={13} /></button>
              </div>
              <div className="chain mt">
                {chain.length === 0 && <span className="faint" style={{ fontSize: 11 }}>— خالی —</span>}
                {chain.map((m, i) => (
                  <span key={`${m.model_id}-${i}`} className="chain-item">
                    {i > 0 && <span className="chain-arrow">←</span>}
                    <span className={`badge ${i === 0 ? 'primary' : 'neutral'}`} title={m.identifier ?? ''}>
                      {chainLabel(m)}
                    </span>
                  </span>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* ---------- discovery modal ---------- */}
      {discovery && (
        <Modal title="دریافت فهرست مدل‌ها از تأمین‌کننده" onClose={() => setDiscovery(null)} wide>
          <div className="row" style={{ gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <div className="field" style={{ flex: 1, minWidth: 200, marginBottom: 0 }}>
              <label>تأمین‌کننده</label>
              <select className="select" value={discovery.providerId} disabled={discovery.loading}
                onChange={(e) => setDiscovery({ ...discovery, providerId: Number(e.target.value), data: null, picked: new Set(), query: '' })}>
                {providers.map((p) => <option key={p.id} value={p.id}>{p.display_name} ({p.kind})</option>)}
              </select>
            </div>
            <button className="btn primary" disabled={discovery.loading} onClick={() => fetchModels(discovery.providerId)}>
              {discovery.loading ? <Spinner size={14} /> : <Icon name="refresh" size={14} />} دریافت لیست
            </button>
          </div>

          {!discovery.data && !discovery.loading && (
            <p className="muted mt" style={{ fontSize: 12 }}>
              دکمه‌ی «دریافت لیست» فهرست مدل‌های واقعی تأمین‌کننده را با کلید فعال آن می‌خواند
              (<span className="mono" dir="ltr">GET /v1/models</span>).
            </p>
          )}

          {discovery.loading && <div className="row mt" style={{ gap: 8 }}><Spinner size={16} /><span className="muted">در حال تماس با تأمین‌کننده…</span></div>}

          {discovery.data && !discovery.data.supported && (
            <div className="notice warn mt">
              <Icon name="alert" size={15} />
              <div>
                <div style={{ fontWeight: 700 }}>فهرست مدل‌ها در دسترس نیست</div>
                <div className="muted" style={{ fontSize: 12 }}>{discovery.data.reason || 'این تأمین‌کننده endpoint فهرست مدل ندارد'}</div>
                {discovery.data.hasKey === false && (
                  <div className="muted" style={{ fontSize: 12 }}>هیچ کلید فعالی برای این تأمین‌کننده ثبت نشده است.</div>
                )}
                <button className="btn sm mt" onClick={() => { const pid = discovery.providerId; setDiscovery(null); setModelForm({ ...EMPTY_MODEL, provider_id: pid }); }}>
                  <Icon name="edit" size={13} /> ثبت دستی شناسه‌ی مدل
                </button>
              </div>
            </div>
          )}

          {discovery.data?.supported && (
            <>
              <div className="row mt" style={{ gap: 8, flexWrap: 'wrap' }}>
                <input className="input" dir="ltr" style={{ flex: 1, minWidth: 180 }} placeholder="جستجوی شناسه…"
                  value={discovery.query} onChange={(e) => setDiscovery({ ...discovery, query: e.target.value })} />
                <button className="btn sm" onClick={pickAllVisible}><Icon name="check" size={13} /> انتخاب همه</button>
                <span className="faint" style={{ fontSize: 11 }}>
                  {fmtNum(filteredDiscovered.length)} از {fmtNum(discovery.data.count)} — {fmtNum(pickedCount)} انتخاب‌شده
                </span>
              </div>

              <div className="discover-list mt">
                {filteredDiscovered.length === 0 && <div className="faint" style={{ padding: 16, fontSize: 12 }}>موردی مطابق جستجو نیست</div>}
                {filteredDiscovered.map((m) => (
                  <label key={m.identifier} className={`discover-row${m.registered ? ' is-registered' : ''}`}>
                    <input type="checkbox" disabled={m.registered}
                      checked={discovery.picked.has(m.identifier)} onChange={() => togglePick(m.identifier)} />
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div className="mono" dir="ltr" style={{ fontSize: 12.5, fontWeight: 600, overflowWrap: 'anywhere' }}>{m.identifier}</div>
                      <div className="faint" style={{ fontSize: 11 }}>
                        {m.context_window ? `${fmtNum(m.context_window)} توکن` : 'کانتکست نامعلوم'}
                        {m.input_price != null && ` · $${m.input_price}/1M ورودی`}
                        {m.output_price != null && ` · $${m.output_price}/1M خروجی`}
                      </div>
                    </div>
                    <div className="row" style={{ gap: 4, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                      {(m.capabilities ?? []).slice(0, 4).map((c) => <span key={c} className="badge neutral">{c}</span>)}
                      {m.registered
                        ? <span className="badge success">ثبت‌شده</span>
                        : <button type="button" className="btn sm ghost" title="ثبت با ویرایش"
                            onClick={(e) => { e.preventDefault(); importOne(m); }}><Icon name="edit" size={12} /></button>}
                    </div>
                  </label>
                ))}
              </div>
            </>
          )}

          <div className="row mt" style={{ justifyContent: 'flex-end' }}>
            <button className="btn" onClick={() => setDiscovery(null)}>{t('cancel')}</button>
            {discovery.data?.supported && (
              <button className="btn primary" disabled={pickedCount === 0 || discovery.importing} onClick={importPicked}>
                {discovery.importing ? <Spinner size={14} /> : <Icon name="save" size={14} />} ثبت {fmtNum(pickedCount)} مدل
              </button>
            )}
          </div>
        </Modal>
      )}

      {/* ---------- manual add / edit modal ---------- */}
      {modelForm && (
        <Modal title={modelForm._id ? `ویرایش مدل — ${modelForm.identifier}` : 'ثبت مدل جدید'} onClose={() => setModelForm(null)} wide>
          <div className="grid grid-2">
            <div className="field"><label>تأمین‌کننده</label>
              <select className="select" value={modelForm.provider_id} disabled={Boolean(modelForm._id)}
                onChange={(e) => setModelForm({ ...modelForm, provider_id: Number(e.target.value) })}>
                {providers.map((p) => <option key={p.id} value={p.id}>{p.display_name}</option>)}
              </select>
              {!modelForm._id && (
                <button className="btn sm ghost" style={{ alignSelf: 'flex-start' }}
                  onClick={() => { const pid = modelForm.provider_id; setModelForm(null); setDiscovery({ providerId: pid, loading: false, data: null, picked: new Set(), query: '', importing: false }); fetchModels(pid); }}>
                  <Icon name="download" size={12} /> انتخاب از فهرست تأمین‌کننده
                </button>
              )}
            </div>
            <div className="field"><label>شناسه‌ی مدل (provider-native)</label>
              <input className="input mono" dir="ltr" value={modelForm.identifier} disabled={Boolean(modelForm._id)}
                onChange={(e) => setModelForm({ ...modelForm, identifier: e.target.value })} placeholder="gpt-4o-mini" />
              {modelForm._id && <span className="faint" style={{ fontSize: 11 }}>شناسه پس از ثبت قابل تغییر نیست</span>}
            </div>
            <div className="field"><label>نام نمایشی</label>
              <input className="input" value={modelForm.display_name}
                onChange={(e) => setModelForm({ ...modelForm, display_name: e.target.value })} placeholder={modelForm.identifier} /></div>
            <div className="field"><label>وضعیت</label>
              <select className="select" value={modelForm.status} onChange={(e) => setModelForm({ ...modelForm, status: e.target.value })}>
                <option value="active">فعال</option>
                <option value="disabled">غیرفعال</option>
              </select></div>
            <div className="field"><label>پنجره‌ی کانتکست (توکن)</label>
              <input className="input" type="number" dir="ltr" value={modelForm.context_window}
                onChange={(e) => setModelForm({ ...modelForm, context_window: e.target.value })} /></div>
            <div className="field"><label>حداکثر خروجی (توکن)</label>
              <input className="input" type="number" dir="ltr" value={modelForm.max_output}
                onChange={(e) => setModelForm({ ...modelForm, max_output: e.target.value })} /></div>
            <div className="field"><label>قیمت ورودی ($ / 1M)</label>
              <input className="input" type="number" step="0.01" dir="ltr" value={modelForm.input_price}
                onChange={(e) => setModelForm({ ...modelForm, input_price: e.target.value })} /></div>
            <div className="field"><label>قیمت خروجی ($ / 1M)</label>
              <input className="input" type="number" step="0.01" dir="ltr" value={modelForm.output_price}
                onChange={(e) => setModelForm({ ...modelForm, output_price: e.target.value })} /></div>
            <div className="field"><label>اولویت (کمتر = بهتر)</label>
              <input className="input" type="number" dir="ltr" value={modelForm.priority}
                onChange={(e) => setModelForm({ ...modelForm, priority: e.target.value })} /></div>
          </div>

          <div className="field"><label>قابلیت‌ها</label>
            <div className="chip-picker">
              {CAPABILITIES.map((c) => (
                <button type="button" key={c.key}
                  className={`chip${modelForm.capabilities.includes(c.key) ? ' active' : ''}`}
                  onClick={() => toggleCap(c.key)}>
                  {modelForm.capabilities.includes(c.key) && <Icon name="check" size={11} />}
                  {c.label}
                </button>
              ))}
            </div>
          </div>

          <div className="field"><label>توضیح</label>
            <input className="input" value={modelForm.description}
              onChange={(e) => setModelForm({ ...modelForm, description: e.target.value })} /></div>

          <div className="row" style={{ justifyContent: 'flex-end' }}>
            <button className="btn" onClick={() => setModelForm(null)}>{t('cancel')}</button>
            <button className="btn primary" onClick={saveModel} disabled={!modelForm.identifier.trim()}>{t('save')}</button>
          </div>
        </Modal>
      )}

      {/* ---------- delete confirm ---------- */}
      {confirmDel && (
        <ConfirmDialog title="حذف مدل"
          message={confirmDel.blocker
            ? `${confirmDel.blocker} — با تأیید، مدل و ارجاعات آن حذف می‌شود.`
            : `مدل «${confirmDel.display_name || confirmDel.identifier}» حذف شود؟`}
          onConfirm={() => deleteModel(Boolean(confirmDel.blocker))}
          onClose={() => setConfirmDel(null)} />
      )}

      {/* ---------- routing debugger ---------- */}
      {routeDebug && (
        <Modal title="دیباگر روتینگ" onClose={() => setRouteDebug(null)} wide>
          <p className="muted" style={{ fontSize: 12 }}>پروفایل: {routeDebug.profileKey}</p>
          {(routeDebug.chain ?? []).map((c) => (
            <div key={c.position} className="row" style={{ justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
              <span className="badge primary">{c.position}</span>
              <span className="mono" dir="ltr">{c.model}</span>
              <span className={`badge ${c.circuit === 'closed' ? 'success' : c.circuit === 'half_open' ? 'warning' : 'danger'}`}>{c.circuit}</span>
              <span className="faint" style={{ fontSize: 11 }}>{c.note}</span>
            </div>
          ))}
          {(routeDebug.skipped ?? []).length > 0 && (
            <p className="faint mt" style={{ fontSize: 11 }}>خارج از زنجیره (عمق fallback حداکثر ۵): {routeDebug.skipped.join(', ')}</p>
          )}
        </Modal>
      )}

      {/* ---------- profile editor ---------- */}
      {editingProfile && (
        <Modal title={profileForm.name} onClose={() => setEditingProfile(null)}>
          <p className="muted" style={{ fontSize: 12 }}>
            ترتیب انتخاب = ترتیب fallback. اولی «اصلی» و بقیه جایگزین هستند.
          </p>
          {(models ?? []).length === 0 && (
            <div className="notice warn mt"><Icon name="alert" size={15} />
              <div>ابتدا مدل ثبت کنید (دکمه‌ی «دریافت لیست مدل‌ها»).</div></div>
          )}
          <div className="field mt"><label>زنجیره‌ی مدل‌ها (به ترتیب)</label>
            {profileForm.models.map((modelId, i) => (
              <div key={i} className="row" style={{ marginBottom: 6 }}>
                <span className="badge primary" style={{ whiteSpace: 'nowrap' }}>{i === 0 ? 'اصلی' : `Fallback ${i}`}</span>
                <select className="select" value={modelId ?? ''}
                  onChange={(e) => setProfileForm({
                    ...profileForm,
                    models: profileForm.models.map((m, j) => (j === i ? Number(e.target.value) : m)),
                  })}>
                  {(models ?? []).map((m) => (
                    <option key={m.id} value={m.id}>{m.provider_slug} / {m.display_name || m.identifier}</option>
                  ))}
                </select>
                <button className="btn sm ghost" title="بالا" disabled={i === 0}
                  onClick={() => setProfileForm({ ...profileForm, models: swap(profileForm.models, i, i - 1) })}>↑</button>
                <button className="btn sm ghost" title="پایین" disabled={i === profileForm.models.length - 1}
                  onClick={() => setProfileForm({ ...profileForm, models: swap(profileForm.models, i, i + 1) })}>↓</button>
                <button className="btn sm ghost" onClick={() => setProfileForm({ ...profileForm, models: profileForm.models.filter((_, j) => j !== i) })}><Icon name="x" size={13} /></button>
              </div>
            ))}
            <button className="btn sm mt" disabled={!models?.length}
              onClick={() => setProfileForm({ ...profileForm, models: [...profileForm.models, models[0].id] })}>
              <Icon name="plus" size={12} /> افزودن مدل
            </button>
          </div>
          <div className="row" style={{ justifyContent: 'flex-end' }}>
            <button className="btn" onClick={() => setEditingProfile(null)}>{t('cancel')}</button>
            <button className="btn primary" onClick={saveProfile}>{t('save')}</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

/** Immutable element swap used by the fallback-chain reorder buttons. */
function swap(arr, a, b) {
  const out = [...arr];
  [out[a], out[b]] = [out[b], out[a]];
  return out;
}

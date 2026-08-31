import { useCallback, useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { fmtNum, fmtBytes, t } from '../lib/i18n.js';
import { DataTable, Modal, StatusBadge, MetricCard } from '../components/ui.jsx';
import { useStore } from '../state/store.jsx';
import { Icon } from '../components/icons.jsx';

/** Model registry + logical profile mapping. */
export function ModelsPage() {
  const { toast } = useStore();
  const [models, setModels] = useState(null);
  const [providers, setProviders] = useState([]);
  const [profiles, setProfiles] = useState(null);
  const [adding, setAdding] = useState(false);
  const [modelForm, setModelForm] = useState(null);
  const [editingProfile, setEditingProfile] = useState(null);
  const [profileForm, setProfileForm] = useState(null);

  const load = useCallback(async () => {
    try {
      const [m, p, pr] = await Promise.all([api('/models'), api('/providers'), api('/model-profiles')]);
      setModels(m); setProviders(p); setProfiles(pr);
    } catch (err) { toast(err.message, 'error'); }
  }, [toast]);
  useEffect(() => { load(); }, [load]);

  const startAddModel = () => {
    if (!providers.length) { toast('ابتدا یک تأمین‌کننده بسازید', 'error'); return; }
    setModelForm({ provider_id: providers[0].id, identifier: '', display_name: '', context_window: 128000, capabilities: 'chat,streaming', priority: 100 });
    setAdding(true);
  };
  const saveModel = async () => {
    try {
      await api(`/providers/${modelForm.provider_id}/models`, {
        method: 'POST',
        body: {
          identifier: modelForm.identifier, display_name: modelForm.display_name || modelForm.identifier,
          context_window: Number(modelForm.context_window) || null,
          capabilities: modelForm.capabilities.split(',').map((s) => s.trim()).filter(Boolean),
          priority: Number(modelForm.priority) || 100,
        },
      });
      toast(t('saved'), 'success'); setAdding(false); load();
    } catch (err) { toast(err.message, 'error'); }
  };

  const editProfile = (profile) => {
    setEditingProfile(profile);
    setProfileForm({ key: profile.key, name: profile.name, models: (profile.models ?? []).filter((m) => m.model_id).map((m) => m.model_id) });
  };
  const saveProfile = async () => {
    try {
      await api(`/model-profiles/${profileForm.key}`, { method: 'PUT', body: { name: profileForm.name, models: profileForm.models.map(Number) } });
      toast(t('saved'), 'success'); setEditingProfile(null); load();
    } catch (err) { toast(err.message, 'error'); }
  };

  const providerName = (id) => providers.find((p) => p.id === id)?.display_name ?? `#${id}`;

  const [routeDebug, setRouteDebug] = useState(null);
  const runRouteDebug = async () => {
    try { setRouteDebug(await api('/debug/route', { method: 'POST', body: { profileKey: editingProfile?.key ?? 'balanced', require: [] } })); }
    catch (err) { toast(err.message, 'error'); }
  };

  return (
    <div className="page">
      <h1 className="page-title"><span className="title-icon"><Icon name="models" size={20} /></span>{t('models')}</h1>
      <p className="page-subtitle">مدل‌های واقعی + پروفایل‌های منطقی (گروه‌ها «Smart» را انتخاب می‌کنند، نه نام پرووایدر)</p>

      <div className="row" style={{ marginBottom: 14 }}>
        <button className="btn primary" onClick={startAddModel}>+ ثبت مدل</button>
        <button className="btn" onClick={runRouteDebug}><Icon name="search" size={13} /> دیباگر روتینگ</button>
      </div>

      <DataTable loading={!models} rows={models} emptyText="هیچ مدلی ثبت نشده است"
        columns={[
          { key: 'display_name', label: 'Model', render: (m) => (
            <div style={{ fontWeight: 600 }}>{m.display_name}
              <div className="faint mono" style={{ fontSize: 11 }}>{m.provider_slug} / {m.identifier}</div></div>
          )},
          { key: 'context_window', label: 'Context', render: (m) => m.context_window ? fmtNum(m.context_window) : '—' },
          { key: 'capabilities', label: 'Capabilities', render: (m) => (
            <div className="row" style={{ flexWrap: 'wrap', gap: 4 }}>
              {(m.capabilities ?? []).map((c) => <span key={c} className="badge neutral">{c}</span>)}
            </div>
          )},
          { key: 'priority', label: 'Priority' },
          { key: 'status', label: t('status'), render: (m) => <StatusBadge value={m.status} /> },
        ]}
      />

      <h2 style={{ fontSize: 17, margin: '26px 0 12px' }}><Icon name="models" size={16} /> پروفایل‌های منطقی</h2>
      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))' }}>
        {(profiles ?? []).map((p) => (
          <div key={p.id} className="card">
            <div className="row">
              <Icon name="models" size={20} />
              <div style={{ fontWeight: 700 }}>{p.name}</div>
              <div className="spacer" />
              <button className="btn sm" onClick={() => editProfile(p)}><Icon name="edit" size={13} /></button>
            </div>
            <div className="muted mono mt" style={{ fontSize: 11 }}>
              {(p.models ?? []).filter((m) => m.model_id).map((m, i) => `${i === 0 ? '' : ' → '}${providerName(m.model_id)}`)}{' '}
              {(p.models ?? []).filter((m) => m.model_id).length === 0 && '— خالی —'}
            </div>
          </div>
        ))}
      </div>

      {routeDebug && (
        <Modal title="دیباگر روتینگ (spec §119)" onClose={() => setRouteDebug(null)} wide>
          <p className="muted" style={{ fontSize: 12 }}>پروفایل: {routeDebug.profileKey}</p>
          {routeDebug.chain.map((c) => (
            <div key={c.position} className="row" style={{ justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
              <span className="badge primary">{c.position}</span>
              <span className="mono">{c.model}</span>
              <span className={`badge ${c.circuit === 'closed' ? 'success' : c.circuit === 'half_open' ? 'warning' : 'danger'}`}>{c.circuit}</span>
              <span className="faint" style={{ fontSize: 11 }}>{c.note}</span>
            </div>
          ))}
          {routeDebug.skipped.length > 0 && (
            <p className="faint mt" style={{ fontSize: 11 }}>خارج از زنجیره (عمق fallback حداکثر ۵): {routeDebug.skipped.join(', ')}</p>
          )}
        </Modal>
      )}

      {adding && (
        <Modal title="ثبت مدل جدید" onClose={() => setAdding(false)}>
          <div className="grid grid-2">
            <div className="field"><label>تأمین‌کننده</label>
              <select className="select" value={modelForm.provider_id}
                onChange={(e) => setModelForm({ ...modelForm, provider_id: Number(e.target.value) })}>
                {providers.map((p) => <option key={p.id} value={p.id}>{p.display_name}</option>)}
              </select></div>
            <div className="field"><label>شناسه‌ی مدل (provider-native)</label>
              <input className="input" dir="ltr" value={modelForm.identifier}
                onChange={(e) => setModelForm({ ...modelForm, identifier: e.target.value })} placeholder="gpt-4o-mini" /></div>
            <div className="field"><label>نام نمایشی</label>
              <input className="input" value={modelForm.display_name}
                onChange={(e) => setModelForm({ ...modelForm, display_name: e.target.value })} /></div>
            <div className="field"><label>پنجره‌ی کانتکست</label>
              <input className="input" type="number" value={modelForm.context_window}
                onChange={(e) => setModelForm({ ...modelForm, context_window: e.target.value })} /></div>
            <div className="field"><label>قابلیت‌ها (با کاما)</label>
              <input className="input" dir="ltr" value={modelForm.capabilities}
                onChange={(e) => setModelForm({ ...modelForm, capabilities: e.target.value })} /></div>
            <div className="field"><label>اولویت (کمتر = بهتر)</label>
              <input className="input" type="number" value={modelForm.priority}
                onChange={(e) => setModelForm({ ...modelForm, priority: e.target.value })} /></div>
          </div>
          <div className="row" style={{ justifyContent: 'flex-end' }}>
            <button className="btn" onClick={() => setAdding(false)}>{t('cancel')}</button>
            <button className="btn primary" onClick={saveModel} disabled={!modelForm.identifier}>{t('save')}</button>
          </div>
        </Modal>
      )}

      {editingProfile && (
        <Modal title={`${profileForm.name}`} onClose={() => setEditingProfile(null)}>
          <p className="muted" style={{ fontSize: 12 }}>
            ترتیب انتخاب = ترتیب fallback. اولی «اصلی» و بقیه جایگزین هستند.
          </p>
          <div className="field mt"><label>زنجیره‌ی مدل‌ها (به ترتیب)</label>
            {profileForm.models.map((modelId, i) => (
              <div key={i} className="row" style={{ marginBottom: 6 }}>
                <span className="badge primary">{i === 0 ? 'اصلی' : `Fallback ${i}`}</span>
                <select className="select" value={modelId}
                  onChange={(e) => setProfileForm({
                    ...profileForm,
                    models: profileForm.models.map((m, j) => (j === i ? Number(e.target.value) : m)),
                  })}>
                  {(models ?? []).map((m) => <option key={m.id} value={m.id}>{m.provider_slug} / {m.display_name}</option>)}
                </select>
                <button className="btn sm ghost" onClick={() => setProfileForm({ ...profileForm, models: profileForm.models.filter((_, j) => j !== i) })}><Icon name="x" size={13} /></button>
              </div>
            ))}
            <button className="btn sm mt" onClick={() => setProfileForm({ ...profileForm, models: [...profileForm.models, models?.[0]?.id] })}>+ افزودن مدل</button>
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

import { useCallback, useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { fmtNum, fmtTime, t } from '../lib/i18n.js';
import { DataTable, StatusBadge, Modal } from '../components/ui.jsx';
import { useStore } from '../state/store.jsx';

const RESPONSE_MODES = ['mention', 'reply', 'mention_reply', 'command', 'always', 'smart', 'conversation', 'admin_only', 'silent'];

export function GroupsPage() {
  const { toast } = useStore();
  const [rows, setRows] = useState(null);
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState(null);
  const [settings, setSettings] = useState(null);
  const [selected, setSelected] = useState(new Set());
  const [bulkAction, setBulkAction] = useState('');
  const [bulkValue, setBulkValue] = useState('');
  const [debug, setDebug] = useState(null);
  const [templates, setTemplates] = useState([]);
  const [templateKey, setTemplateKey] = useState('');
  const [templatePreview, setTemplatePreview] = useState(null);

  const load = useCallback(async () => {
    try {
      setRows(await api(`/groups?search=${encodeURIComponent(search)}`));
      setTemplates(await api('/group-templates'));
    } catch (err) { toast(err.message, 'error'); }
  }, [search, toast]);
  useEffect(() => { load(); }, [load]);

  const openSettings = async (group) => {
    try {
      const detail = await api(`/groups/${group.id}`);
      setEditing(group);
      setSettings({
        response_mode: detail.response_mode ?? 'mention_reply',
        model_profile_key: detail.model_profile_key ?? 'balanced',
        moderation_policy: detail.moderation_policy ?? 'balanced',
        memory_policy: detail.memory_policy ?? 'conservative',
        ai_enabled: detail.ai_enabled ?? true,
        context_messages: detail.context_messages ?? 10,
      });
    } catch (err) { toast(err.message, 'error'); }
  };

  const saveSettings = async () => {
    try {
      await api(`/groups/${editing.id}/settings`, { method: 'PATCH', body: settings });
      toast(t('saved'), 'success');
      setEditing(null);
      load();
    } catch (err) { toast(err.message, 'error'); }
  };

  const openDebug = async (group) => {
    try { setDebug(await api(`/groups/${group.id}/debug`)); }
    catch (err) { toast(err.message, 'error'); }
  };

  // ---- bulk operations ----
  const toggle = (id) => setSelected((prev) => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });
  const runBulk = async () => {
    if (!bulkAction || selected.size === 0) return;
    if (bulkAction === 'blacklist' && !window.confirm(`مسدودسازی ${selected.size} گروه؟`)) return;
    try {
      const valueNeeds = ['set_personality', 'set_model_profile', 'set_moderation'].includes(bulkAction);
      const result = await api('/groups/bulk', {
        method: 'POST',
        body: { ids: [...selected], action: bulkAction, value: valueNeeds ? bulkValue : undefined },
      });
      toast(`${t('saved')} — ${fmtNum(result.affected)} گروه`, 'success');
      setSelected(new Set()); setBulkAction(''); setBulkValue('');
      load();
    } catch (err) { toast(err.message, 'error'); }
  };

  const previewTemplate = async () => {
    if (!editing || !templateKey) return;
    try {
      setTemplatePreview(await api(`/groups/${editing.id}/apply-template`, {
        method: 'POST', body: { key: templateKey, preview: true },
      }));
    } catch (err) { toast(err.message, 'error'); }
  };
  const applyTemplate = async () => {
    if (!editing || !templateKey) return;
    try {
      await api(`/groups/${editing.id}/apply-template`, { method: 'POST', body: { key: templateKey } });
      toast('قالب اعمال شد', 'success');
      setTemplatePreview(null); setEditing(null);
      load();
    } catch (err) { toast(err.message, 'error'); }
  };

  return (
    <div className="page">
      <h1 className="page-title">👥 {t('groups')}</h1>
      <p className="page-subtitle">{rows ? `${fmtNum(rows.length)} group(s)` : t('loading')}</p>
      <div className="row" style={{ marginBottom: 14 }}>
        <input className="input" style={{ maxWidth: 280 }} placeholder={t('search')}
          value={search} onChange={(e) => setSearch(e.target.value)} />
        <div className="spacer" />
        <button className="btn" onClick={load}>🔄 {t('refresh')}</button>
      </div>

      {/* Bulk operations bar (spec §193) */}
      {selected.size > 0 && (
        <div className="card row" style={{ marginBottom: 14, borderColor: 'var(--primary)' }}>
          <span className="badge primary">{fmtNum(selected.size)} انتخاب‌شده</span>
          <select className="select" style={{ width: 210 }} value={bulkAction} onChange={(e) => setBulkAction(e.target.value)}>
            <option value="">عملیات گروهی…</option>
            <option value="set_personality">تعیین شخصیت (ID)</option>
            <option value="set_model_profile">تعیین پروفایل مدل</option>
            <option value="set_moderation">تعیین سیاست مدریشن</option>
            <option value="enable_ai">فعال‌سازی AI</option>
            <option value="disable_ai">غیرفعال‌سازی AI</option>
            <option value="blacklist">مسدودسازی گروه‌ها</option>
          </select>
          {['set_personality', 'set_model_profile', 'set_moderation'].includes(bulkAction) && (
            <input className="input" style={{ width: 160 }} placeholder="مقدار" dir="ltr"
              value={bulkValue} onChange={(e) => setBulkValue(e.target.value)} />
          )}
          <button className="btn primary" onClick={runBulk} disabled={!bulkAction}>اجرای گروهی</button>
          <button className="btn ghost" onClick={() => setSelected(new Set())}>لغو انتخاب</button>
        </div>
      )}

      <DataTable loading={!rows} rows={rows} emptyText="هیچ گروهی ثبت نشده است — ربات را به گروه اضافه کنید"
        columns={[
          { key: '_select', label: '☑', sortable: false, render: (g) => (
            <input type="checkbox" checked={selected.has(g.id)} onChange={() => toggle(g.id)} />
          )},
          { key: 'title', label: 'Title', render: (g) => (
            <div>
              <div style={{ fontWeight: 600 }}>{g.title ?? '—'}</div>
              {g.username && <div className="faint mono" style={{ fontSize: 11 }}>@{g.username}</div>}
            </div>
          )},
          { key: 'type', label: 'Type' },
          { key: 'status', label: t('status'), render: (g) => <StatusBadge value={g.status} /> },
          { key: 'ai_enabled', label: 'AI', render: (g) => <StatusBadge value={g.ai_enabled === false ? 'disabled' : 'active'} /> },
          { key: 'response_mode', label: 'Response mode' },
          { key: 'last_activity', label: 'Last activity', render: (g) => fmtTime(g.last_activity) },
          { key: 'actions', label: t('actions'), sortable: false, render: (g) => (
            <div className="row">
              <button className="btn sm" onClick={() => openSettings(g)}>⚙️</button>
              <button className="btn sm" title="دیباگر پیکربندی" onClick={() => openDebug(g)}>🔍</button>
            </div>
          )},
        ]}
      />

      {editing && settings && (
        <Modal title={`⚙️ ${editing.title ?? editing.id}`} onClose={() => { setEditing(null); setTemplatePreview(null); }}>
          <div className="grid grid-2">
            <div className="field"><label>AI</label>
              <select className="select" value={String(settings.ai_enabled)}
                onChange={(e) => setSettings({ ...settings, ai_enabled: e.target.value === 'true' })}>
                <option value="true">فعال</option><option value="false">غیرفعال</option>
              </select></div>
            <div className="field"><label>حالت پاسخ</label>
              <select className="select" value={settings.response_mode}
                onChange={(e) => setSettings({ ...settings, response_mode: e.target.value })}>
                {RESPONSE_MODES.map((m) => <option key={m} value={m}>{m}</option>)}
              </select></div>
            <div className="field"><label>پروفایل مدل</label>
              <input className="input" value={settings.model_profile_key}
                onChange={(e) => setSettings({ ...settings, model_profile_key: e.target.value })} /></div>
            <div className="field"><label>سیاست مدریشن</label>
              <select className="select" value={settings.moderation_policy}
                onChange={(e) => setSettings({ ...settings, moderation_policy: e.target.value })}>
                {['off', 'relaxed', 'balanced', 'strict'].map((m) => <option key={m} value={m}>{m}</option>)}
              </select></div>
            <div className="field"><label>حافظه</label>
              <select className="select" value={settings.memory_policy}
                onChange={(e) => setSettings({ ...settings, memory_policy: e.target.value })}>
                {['off', 'conservative', 'standard', 'aggressive'].map((m) => <option key={m} value={m}>{m}</option>)}
              </select></div>
            <div className="field"><label>تعداد پیام کانتکست</label>
              <input className="input" type="number" min="2" max="50" value={settings.context_messages}
                onChange={(e) => setSettings({ ...settings, context_messages: Number(e.target.value) })} /></div>
          </div>

          <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12, marginTop: 6 }}>
            <div className="field"><label>قالب آماده (spec §139–140)</label>
              <div className="row">
                <select className="select" value={templateKey} onChange={(e) => setTemplateKey(e.target.value)}>
                  <option value="">انتخاب قالب…</option>
                  {templates.map((tpl) => <option key={tpl.key} value={tpl.key}>{tpl.name}{tpl.builtin ? ' (داخلی)' : ''}</option>)}
                </select>
                <button className="btn" onClick={previewTemplate} disabled={!templateKey}>پیش‌نمایش</button>
                <button className="btn primary" onClick={applyTemplate} disabled={!templateKey}>اعمال</button>
              </div>
              {templatePreview && (
                <pre className="mono mt" style={{ background: 'var(--surface-3)', padding: 10, borderRadius: 8, direction: 'ltr', fontSize: 11 }}>
                  {JSON.stringify(templatePreview.preview, null, 2)}
                </pre>
              )}
            </div>
          </div>

          <div className="row" style={{ justifyContent: 'flex-end' }}>
            <button className="btn" onClick={() => setEditing(null)}>{t('cancel')}</button>
            <button className="btn primary" onClick={saveSettings}>{t('save')}</button>
          </div>
        </Modal>
      )}

      {debug && (
        <Modal title={`🔍 دیباگر پیکربندی — ${debug.group.title ?? debug.group.id}`} onClose={() => setDebug(null)} wide>
          {debug.resolution.map((layer, i) => (
            <div key={i} className="card" style={{ marginBottom: 10, padding: 12 }}>
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <span className="badge primary">{layer.layer}</span>
                <span className="faint" style={{ fontSize: 11 }}>{layer.source}</span>
              </div>
              <pre className="mono mt" style={{ fontSize: 11, direction: 'ltr', whiteSpace: 'pre-wrap' }}>
                {JSON.stringify(layer.values, null, 2)}
              </pre>
            </div>
          ))}
        </Modal>
      )}
    </div>
  );
}

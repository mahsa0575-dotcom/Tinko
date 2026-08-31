import { useCallback, useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { fmtNum, fmtTime, t } from '../lib/i18n.js';
import { DataTable, StatusBadge, Modal } from '../components/ui.jsx';
import { Tabs } from '../components/tabs-extra.jsx';
import { Icon } from '../components/icons.jsx';
import { useStore } from '../state/store.jsx';

export function ModerationPage() {
  const { toast } = useStore();
  const [tab, setTab] = useState('events');
  const [events, setEvents] = useState(null);
  const [warnings, setWarnings] = useState(null);
  const [rules, setRules] = useState(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState(null);

  const load = useCallback(async () => {
    try {
      const [e, w, r] = await Promise.all([api('/moderation/events'), api('/moderation/warnings'), api('/moderation/rules')]);
      setEvents(e); setWarnings(w); setRules(r);
    } catch (err) { toast(err.message, 'error'); }
  }, [toast]);
  useEffect(() => { load(); }, [load]);

  const startRule = () => {
    setForm({ name: '', kind: 'wordlist', pattern: '', severity: 'medium', action: 'warn', config: {} });
    setCreating(true);
  };
  const saveRule = async () => {
    try {
      await api('/moderation/rules', { method: 'POST', body: { ...form, pattern: form.pattern || undefined } });
      toast(t('saved'), 'success'); setCreating(false); load();
    } catch (err) { toast(err.message, 'error'); }
  };

  return (
    <div className="page">
      <div className="row">
        <h1 className="page-title"><span className="title-icon"><Icon name="shield" size={20} /></span>{t('moderation')}</h1>
        <div className="spacer" />
        <button className="btn primary" onClick={startRule}>+ قانون جدید</button>
      </div>

      <div className="tabs">
        {['events', 'warnings', 'rules'].map((key) => (
          <button key={key} className={`tab${tab === key ? ' active' : ''}`} onClick={() => setTab(key)}>
            {key === 'events' ? 'رخدادها' : key === 'warnings' ? 'تذکرها' : 'قوانین'}
          </button>
        ))}
      </div>

      {tab === 'events' && (
        <DataTable loading={!events} rows={events} emptyText="رخدادی ثبت نشده است"
          columns={[
            { key: 'created_at', label: 'Time', render: (e) => fmtTime(e.created_at) },
            { key: 'user_username', label: 'User', render: (e) => e.user_username ? '@' + e.user_username : '—' },
            { key: 'category', label: 'Category', render: (e) => <span className="badge warning">{e.category}</span> },
            { key: 'severity', label: 'Severity', render: (e) => <StatusBadge value={e.severity === 'high' || e.severity === 'critical' ? 'failed' : 'pending'} /> },
            { key: 'action', label: 'Action' },
          ]}
        />
      )}
      {tab === 'warnings' && (
        <DataTable loading={!warnings} rows={warnings} emptyText="تذکری ثبت نشده است"
          columns={[
            { key: 'created_at', label: 'Time', render: (w) => fmtTime(w.created_at) },
            { key: 'username', label: 'User', render: (w) => w.username ? '@' + w.username : (w.first_name ?? '—') },
            { key: 'reason', label: 'Reason' },
          ]}
        />
      )}
      {tab === 'rules' && (
        <DataTable loading={!rules} rows={rules} emptyText="قانونی تعریف نشده است — موتور داخلی فحش فارسی همیشه فعال است"
          columns={[
            { key: 'name', label: 'Name' },
            { key: 'kind', label: 'Kind', render: (r) => <span className="badge info">{r.kind}</span> },
            { key: 'severity', label: 'Severity' },
            { key: 'action', label: 'Action' },
            { key: 'enabled', label: t('status'), render: (r) => <StatusBadge value={r.enabled ? 'active' : 'disabled'} /> },
          ]}
        />
      )}

      {creating && (
        <Modal title="قانون مدریشن جدید" onClose={() => setCreating(false)}>
          <div className="grid grid-2">
            <div className="field"><label>نام</label>
              <input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
            <div className="field"><label>نوع</label>
              <select className="select" value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })}>
                {['wordlist', 'regex', 'flood', 'duplicate', 'link', 'mention_spam', 'ai'].map((k) => <option key={k} value={k}>{k}</option>)}
              </select></div>
            <div className="field"><label>الگو (wordlist/regex)</label>
              <input className="input" dir="ltr" value={form.pattern} onChange={(e) => setForm({ ...form, pattern: e.target.value })} /></div>
            <div className="field"><label>شدت</label>
              <select className="select" value={form.severity} onChange={(e) => setForm({ ...form, severity: e.target.value })}>
                {['low', 'medium', 'high', 'critical'].map((s) => <option key={s} value={s}>{s}</option>)}
              </select></div>
            <div className="field"><label>اقدام</label>
              <select className="select" value={form.action} onChange={(e) => setForm({ ...form, action: e.target.value })}>
                {['warn', 'delete', 'mute', 'temp_mute', 'restrict', 'kick', 'ban', 'ignore', 'escalate'].map((a) => <option key={a} value={a}>{a}</option>)}
              </select></div>
          </div>
          <div className="row" style={{ justifyContent: 'flex-end' }}>
            <button className="btn" onClick={() => setCreating(false)}>{t('cancel')}</button>
            <button className="btn primary" onClick={saveRule} disabled={!form.name}>{t('save')}</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

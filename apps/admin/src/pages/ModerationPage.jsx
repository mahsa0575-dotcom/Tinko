import { useCallback, useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { fmtNum, fmtTime, t } from '../lib/i18n.js';
import {
  DataTable, StatusBadge, SeverityBadge, Modal, PageHeader, Tabs,
  Field, Notice,
} from '../components/ui.jsx';
import { Icon } from '../components/icons.jsx';
import { useStore } from '../state/store.jsx';

const KIND_LABEL = {
  wordlist: 'فهرست واژه', regex: 'الگوی Regex', flood: 'ارسال سیل‌آسا',
  duplicate: 'پیام تکراری', link: 'لینک', mention_spam: 'منشن انبوه', ai: 'تشخیص هوش مصنوعی',
};
const ACTION_LABEL = {
  warn: 'تذکر', delete: 'حذف پیام', mute: 'سکوت', temp_mute: 'سکوت موقت',
  restrict: 'محدودسازی', kick: 'اخراج', ban: 'مسدودسازی',
  ignore: 'نادیده گرفتن', escalate: 'ارجاع به مدیر',
};
const SEVERITY_LABEL = { low: 'کم', medium: 'متوسط', high: 'بالا', critical: 'بحرانی' };
const CATEGORY_LABEL = {
  profanity: 'فحاشی', spam: 'اسپم', harassment: 'آزار', hate: 'نفرت‌پراکنی',
  sexual: 'محتوای جنسی', violence: 'خشونت', link: 'لینک ناخواسته', flood: 'سیل پیام', other: 'سایر',
};

const userLabel = (r) =>
  r.username ? '@' + r.username : (r.user_username ? '@' + r.user_username : (r.first_name ?? '—'));

export function ModerationPage() {
  const { toast } = useStore();
  const [tab, setTab] = useState('events');
  const [events, setEvents] = useState(null);
  const [warnings, setWarnings] = useState(null);
  const [rules, setRules] = useState(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const [e, w, r] = await Promise.all([
        api('/moderation/events'), api('/moderation/warnings'), api('/moderation/rules'),
      ]);
      setEvents(e); setWarnings(w); setRules(r);
    } catch (err) { toast(err.message, 'error'); }
  }, [toast]);
  useEffect(() => { load(); }, [load]);

  const startRule = () => {
    setForm({ name: '', kind: 'wordlist', pattern: '', severity: 'medium', action: 'warn', config: {} });
    setCreating(true);
  };
  const set = (patch) => setForm((f) => ({ ...f, ...patch }));

  const saveRule = async () => {
    setSaving(true);
    try {
      await api('/moderation/rules', { method: 'POST', body: { ...form, pattern: form.pattern || undefined } });
      toast(t('saved'), 'success'); setCreating(false); load();
    } catch (err) { toast(err.message, 'error'); }
    finally { setSaving(false); }
  };

  const needsPattern = form && (form.kind === 'wordlist' || form.kind === 'regex');

  return (
    <div className="page">
      <PageHeader
        icon="shield"
        title={t('moderation')}
        subtitle="کنترل محتوا، تذکرها و قوانین خودکار — موتور داخلی تشخیص فحاشی فارسی همیشه فعال است"
        actions={(
          <>
            <button className="btn sm" onClick={load}>
              <Icon name="refresh" size={13} /> {t('refresh')}
            </button>
            <button className="btn primary sm" onClick={startRule}>
              <Icon name="plus" size={13} /> قانون جدید
            </button>
          </>
        )}
      />

      <Tabs
        active={tab}
        onChange={setTab}
        tabs={[
          { key: 'events', label: 'رخدادها', icon: 'activity', count: events?.length },
          { key: 'warnings', label: 'تذکرها', icon: 'flag', count: warnings?.length },
          { key: 'rules', label: 'قوانین', icon: 'sliders', count: rules?.length },
        ]}
      />

      {tab === 'events' && (
        <DataTable
          loading={!events} rows={events}
          emptyIcon="shieldCheck" emptyText="هیچ رخداد مدیریتی ثبت نشده است"
          columns={[
            { key: 'created_at', label: t('col_time'), render: (e) => <span className="muted sm ltr">{fmtTime(e.created_at)}</span> },
            { key: 'user_username', label: t('col_user'), render: (e) => <span className="cell-strong ltr">{userLabel(e)}</span> },
            {
              key: 'category', label: 'دسته',
              render: (e) => <span className="badge warning">{CATEGORY_LABEL[e.category] ?? e.category}</span>,
            },
            {
              key: 'severity', label: t('col_severity'), sortValue: (e) => ({ critical: 4, high: 3, medium: 2, low: 1 }[e.severity] ?? 0),
              render: (e) => <SeverityBadge value={e.severity} />,
            },
            {
              key: 'action', label: t('col_action'),
              render: (e) => <span className="muted sm">{ACTION_LABEL[e.action] ?? e.action ?? '—'}</span>,
            },
          ]}
        />
      )}

      {tab === 'warnings' && (
        <DataTable
          loading={!warnings} rows={warnings}
          emptyIcon="flag" emptyText="هیچ تذکری برای کاربران ثبت نشده است"
          columns={[
            { key: 'created_at', label: t('col_time'), render: (w) => <span className="muted sm ltr">{fmtTime(w.created_at)}</span> },
            { key: 'username', label: t('col_user'), render: (w) => <span className="cell-strong ltr">{userLabel(w)}</span> },
            { key: 'reason', label: t('col_reason'), render: (w) => <span className="cell-clip">{w.reason ?? '—'}</span> },
          ]}
        />
      )}

      {tab === 'rules' && (
        <>
          <Notice kind="info" icon="shieldCheck" title="موتور پیش‌فرض">
            جدا از قوانین زیر، تشخیص خودکار فحاشی فارسی به‌صورت داخلی و همیشگی اجرا می‌شود.
            قوانین سفارشی روی آن اضافه می‌شوند.
          </Notice>
          <DataTable
            loading={!rules} rows={rules}
            emptyIcon="sliders" emptyText="هنوز قانون سفارشی‌ای تعریف نشده است"
            columns={[
              { key: 'name', label: t('col_name'), render: (r) => <span className="cell-strong">{r.name}</span> },
              { key: 'kind', label: t('col_type'), render: (r) => <span className="badge info">{KIND_LABEL[r.kind] ?? r.kind}</span> },
              {
                key: 'pattern', label: t('col_pattern'), sortable: false,
                render: (r) => r.pattern
                  ? <code className="ltr xs">{String(r.pattern).slice(0, 40)}</code>
                  : <span className="faint">—</span>,
              },
              {
                key: 'severity', label: t('col_severity'), sortValue: (r) => ({ critical: 4, high: 3, medium: 2, low: 1 }[r.severity] ?? 0),
                render: (r) => <SeverityBadge value={r.severity} />,
              },
              { key: 'action', label: t('col_action'), render: (r) => <span className="muted sm">{ACTION_LABEL[r.action] ?? r.action}</span> },
              { key: 'enabled', label: t('status'), render: (r) => <StatusBadge value={r.enabled ? 'active' : 'disabled'} /> },
            ]}
          />
        </>
      )}

      {creating && (
        <Modal
          title="قانون مدیریت محتوای جدید"
          icon="sliders"
          onClose={() => setCreating(false)}
          footer={(
            <>
              <div className="spacer" />
              <button className="btn" onClick={() => setCreating(false)}>{t('cancel')}</button>
              <button className="btn primary" onClick={saveRule} disabled={saving || !form.name.trim()}>
                {t('create')}
              </button>
            </>
          )}
        >
          <div className="col">
            <Field label="نام قانون" required hint="نامی که در فهرست قوانین دیده می‌شود.">
              <input className="input" value={form.name} placeholder="مثلاً: مسدودسازی لینک تبلیغاتی"
                onChange={(e) => set({ name: e.target.value })} />
            </Field>

            <div className="grid grid-2">
              <Field label="نوع تشخیص">
                <select className="select" value={form.kind} onChange={(e) => set({ kind: e.target.value })}>
                  {Object.entries(KIND_LABEL).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
                </select>
              </Field>
              <Field label="اقدام">
                <select className="select" value={form.action} onChange={(e) => set({ action: e.target.value })}>
                  {Object.entries(ACTION_LABEL).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
                </select>
              </Field>
            </div>

            <Field
              label="شدت"
              hint="شدت بالاتر باعث ارجاع سریع‌تر به مدیران و ثبت در گزارش امنیتی می‌شود."
            >
              <div className="segmented">
                {Object.entries(SEVERITY_LABEL).map(([k, label]) => (
                  <button key={k} className={form.severity === k ? 'active' : ''}
                    onClick={() => set({ severity: k })}>{label}</button>
                ))}
              </div>
            </Field>

            {needsPattern && (
              <Field
                label={form.kind === 'regex' ? 'عبارت باقاعده (Regex)' : 'فهرست واژه‌ها'}
                hint={form.kind === 'regex'
                  ? 'الگوی JavaScript بدون اسلش ابتدا و انتها.'
                  : 'واژه‌ها را با کاما از هم جدا کنید.'}
              >
                <input className="input mono" dir="ltr" value={form.pattern}
                  placeholder={form.kind === 'regex' ? '(?i)buy\\s+now' : 'word1, word2, word3'}
                  onChange={(e) => set({ pattern: e.target.value })} />
              </Field>
            )}

            {form.kind === 'ai' && (
              <Notice kind="warn" title="مصرف توکن">
                تشخیص با هوش مصنوعی برای هر پیام یک درخواست به مدل می‌فرستد و هزینه دارد.
              </Notice>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}

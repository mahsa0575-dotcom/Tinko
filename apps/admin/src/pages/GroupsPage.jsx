import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api.js';
import { fmtNum, fmtTime, t } from '../lib/i18n.js';
import {
  DataTable, StatusBadge, Modal, ConfirmDialog, PageHeader, SectionCard,
  Toolbar, SearchInput, Field, Checkbox, IconButton, CodeBlock, Notice, Avatar,
} from '../components/ui.jsx';
import { useStore } from '../state/store.jsx';
import { Icon } from '../components/icons.jsx';

const RESPONSE_MODES = {
  mention: 'فقط با منشن',
  reply: 'فقط با ریپلای',
  mention_reply: 'منشن یا ریپلای',
  command: 'فقط با دستور',
  always: 'به همه‌ی پیام‌ها',
  smart: 'هوشمند',
  conversation: 'حالت گفت‌وگو',
  admin_only: 'فقط مدیران',
  silent: 'خاموش',
};
const MODERATION_POLICIES = { off: 'خاموش', relaxed: 'آسان‌گیر', balanced: 'متعادل', strict: 'سخت‌گیر' };
const MEMORY_POLICIES = { off: 'خاموش', conservative: 'محافظه‌کار', standard: 'استاندارد', aggressive: 'پرجزئیات' };
const GROUP_TYPE = { group: 'گروه', supergroup: 'سوپرگروه', channel: 'کانال', private: 'خصوصی' };

const BULK_ACTIONS = [
  { key: 'set_personality', label: 'تعیین شخصیت', needsValue: true, valueHint: 'شناسهٔ شخصیت' },
  { key: 'set_model_profile', label: 'تعیین پروفایل مدل', needsValue: true, valueHint: 'کلید پروفایل' },
  { key: 'set_moderation', label: 'تعیین سیاست مدیریت محتوا', needsValue: true, valueHint: 'off / relaxed / balanced / strict' },
  { key: 'enable_ai', label: 'فعال‌سازی هوش مصنوعی' },
  { key: 'disable_ai', label: 'غیرفعال‌سازی هوش مصنوعی' },
  { key: 'blacklist', label: 'مسدودسازی گروه‌ها', danger: true },
];

export function GroupsPage() {
  const { toast } = useStore();
  const [rows, setRows] = useState(null);
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState(null);
  const [settings, setSettings] = useState(null);
  const [selected, setSelected] = useState(new Set());
  const [bulkAction, setBulkAction] = useState('');
  const [bulkValue, setBulkValue] = useState('');
  const [bulkConfirm, setBulkConfirm] = useState(false);
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
      setTemplateKey(''); setTemplatePreview(null);
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
  const set = (patch) => setSettings((s) => ({ ...s, ...patch }));

  const closeEditor = () => { setEditing(null); setSettings(null); setTemplatePreview(null); setTemplateKey(''); };

  const saveSettings = async () => {
    try {
      await api(`/groups/${editing.id}/settings`, { method: 'PATCH', body: settings });
      toast(t('saved'), 'success');
      closeEditor();
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
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const allSelected = useMemo(
    () => !!rows?.length && rows.every((g) => selected.has(g.id)),
    [rows, selected],
  );
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set((rows ?? []).map((g) => g.id)));

  const activeBulk = BULK_ACTIONS.find((a) => a.key === bulkAction);

  const doBulk = async () => {
    try {
      const result = await api('/groups/bulk', {
        method: 'POST',
        body: { ids: [...selected], action: bulkAction, value: activeBulk?.needsValue ? bulkValue : undefined },
      });
      toast(`انجام شد — ${fmtNum(result.affected)} گروه به‌روزرسانی شد`, 'success');
      setSelected(new Set()); setBulkAction(''); setBulkValue('');
      load();
    } catch (err) { toast(err.message, 'error'); }
  };
  const runBulk = () => {
    if (!bulkAction || selected.size === 0) return;
    if (activeBulk?.danger) { setBulkConfirm(true); return; }
    doBulk();
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
      toast('قالب با موفقیت اعمال شد', 'success');
      closeEditor();
      load();
    } catch (err) { toast(err.message, 'error'); }
  };

  return (
    <div className="page">
      <PageHeader
        icon="users"
        title={t('groups')}
        subtitle="گروه‌ها و کانال‌هایی که ربات در آن‌ها عضو است — تنظیمات هر گروه مستقل است"
        actions={(
          <button className="btn sm" onClick={load}>
            <Icon name="refresh" size={13} /> {t('refresh')}
          </button>
        )}
      />

      <Toolbar>
        <SearchInput value={search} onChange={setSearch} placeholder={t('search')} onEnter={load} />
        <div className="spacer" />
        {rows && <span className="faint sm">{fmtNum(rows.length)} گروه</span>}
      </Toolbar>

      {selected.size > 0 && (
        <SectionCard accent="primary" flat>
          <div className="row wrap">
            <span className="badge primary">
              <span className="dot" /> {fmtNum(selected.size)} گروه انتخاب شد
            </span>
            <select className="select" value={bulkAction} onChange={(e) => setBulkAction(e.target.value)}>
              <option value="">یک عملیات گروهی انتخاب کنید…</option>
              {BULK_ACTIONS.map((a) => <option key={a.key} value={a.key}>{a.label}</option>)}
            </select>
            {activeBulk?.needsValue && (
              <input className="input" dir="ltr" placeholder={activeBulk.valueHint}
                value={bulkValue} onChange={(e) => setBulkValue(e.target.value)} />
            )}
            <div className="spacer" />
            <button className={`btn ${activeBulk?.danger ? 'danger solid' : 'primary'}`}
              onClick={runBulk} disabled={!bulkAction || (activeBulk?.needsValue && !bulkValue.trim())}>
              <Icon name="check" size={14} /> اجرا
            </button>
            <button className="btn ghost" onClick={() => setSelected(new Set())}>لغو انتخاب</button>
          </div>
        </SectionCard>
      )}

      <DataTable
        loading={!rows} rows={rows}
        emptyIcon="users"
        emptyText="هیچ گروهی ثبت نشده است — ربات را به یک گروه اضافه کنید"
        columns={[
          {
            key: '_select', sortable: false, width: '40px',
            label: <Checkbox checked={allSelected} indeterminate={selected.size > 0 && !allSelected}
              onChange={toggleAll} title={t('select_all')} />,
            render: (g) => <Checkbox checked={selected.has(g.id)} onChange={() => toggle(g.id)} />,
          },
          {
            key: 'title', label: t('col_title'),
            render: (g) => (
              <div className="row tight">
                <Avatar name={g.title ?? String(g.id)} />
                <div className="col tight">
                  <span className="cell-strong">{g.title ?? '—'}</span>
                  {g.username && <span className="faint xs ltr">@{g.username}</span>}
                </div>
              </div>
            ),
          },
          {
            key: 'type', label: t('col_type'),
            render: (g) => <span className="badge neutral">{GROUP_TYPE[g.type] ?? g.type ?? '—'}</span>,
          },
          { key: 'status', label: t('status'), render: (g) => <StatusBadge value={g.status} /> },
          {
            key: 'ai_enabled', label: 'هوش مصنوعی',
            render: (g) => <StatusBadge value={g.ai_enabled === false ? 'disabled' : 'active'} />,
          },
          {
            key: 'response_mode', label: t('col_response_mode'),
            render: (g) => <span className="muted sm">{RESPONSE_MODES[g.response_mode] ?? g.response_mode ?? '—'}</span>,
          },
          {
            key: 'last_activity', label: t('col_last_activity'),
            render: (g) => <span className="muted sm ltr">{fmtTime(g.last_activity)}</span>,
          },
          {
            key: 'actions', label: t('actions'), sortable: false, cellClass: 'actions-cell',
            render: (g) => (
              <>
                <IconButton icon="settings" title="تنظیمات گروه" onClick={() => openSettings(g)} />
                <IconButton icon="search" title="دیباگر پیکربندی" onClick={() => openDebug(g)} />
              </>
            ),
          },
        ]}
      />

      {editing && settings && (
        <Modal
          title={editing.title ?? `گروه ${editing.id}`}
          icon="users"
          onClose={closeEditor}
          footer={(
            <>
              <div className="spacer" />
              <button className="btn" onClick={closeEditor}>{t('cancel')}</button>
              <button className="btn primary" onClick={saveSettings}>{t('save')}</button>
            </>
          )}
        >
          <div className="col">
            <div className="grid grid-2">
              <Field label="هوش مصنوعی" hint="با خاموش کردن، ربات در این گروه پاسخ نمی‌دهد.">
                <div className="segmented">
                  <button className={settings.ai_enabled ? 'active' : ''}
                    onClick={() => set({ ai_enabled: true })}>فعال</button>
                  <button className={!settings.ai_enabled ? 'active' : ''}
                    onClick={() => set({ ai_enabled: false })}>غیرفعال</button>
                </div>
              </Field>

              <Field label="حالت پاسخ‌دهی">
                <select className="select" value={settings.response_mode}
                  onChange={(e) => set({ response_mode: e.target.value })}>
                  {Object.entries(RESPONSE_MODES).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
                </select>
              </Field>

              <Field label="پروفایل مدل" hint="کلید پروفایلی که در صفحهٔ مدل‌ها تعریف شده است.">
                <input className="input mono" dir="ltr" value={settings.model_profile_key}
                  onChange={(e) => set({ model_profile_key: e.target.value })} />
              </Field>

              <Field label="تعداد پیام‌های زمینه" hint="چند پیام قبلی به مدل داده شود (۲ تا ۵۰).">
                <input className="input" type="number" min="2" max="50" value={settings.context_messages}
                  onChange={(e) => set({ context_messages: Number(e.target.value) })} />
              </Field>

              <Field label="سیاست مدیریت محتوا">
                <select className="select" value={settings.moderation_policy}
                  onChange={(e) => set({ moderation_policy: e.target.value })}>
                  {Object.entries(MODERATION_POLICIES).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
                </select>
              </Field>

              <Field label="سیاست حافظه">
                <select className="select" value={settings.memory_policy}
                  onChange={(e) => set({ memory_policy: e.target.value })}>
                  {Object.entries(MEMORY_POLICIES).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
                </select>
              </Field>
            </div>

            <SectionCard
              icon="layers"
              title="قالب آماده"
              subtitle="یک پیکربندی از پیش‌آماده را روی این گروه اعمال کنید"
            >
              <div className="row wrap">
                <select className="select" value={templateKey} onChange={(e) => { setTemplateKey(e.target.value); setTemplatePreview(null); }}>
                  <option value="">انتخاب قالب…</option>
                  {templates.map((tpl) => (
                    <option key={tpl.key} value={tpl.key}>{tpl.name}{tpl.builtin ? ' (داخلی)' : ''}</option>
                  ))}
                </select>
                <div className="spacer" />
                <button className="btn" onClick={previewTemplate} disabled={!templateKey}>
                  <Icon name="eye" size={13} /> پیش‌نمایش
                </button>
                <button className="btn primary" onClick={applyTemplate} disabled={!templateKey}>
                  {t('apply')}
                </button>
              </div>

              {templatePreview && (
                <div className="mt">
                  <Notice kind="info" title="این مقادیر جایگزین تنظیمات فعلی می‌شوند">
                    پیش از اعمال، تغییرات را بررسی کنید.
                  </Notice>
                  <CodeBlock title="پیش‌نمایش قالب" copyable compact>
                    {JSON.stringify(templatePreview.preview, null, 2)}
                  </CodeBlock>
                </div>
              )}
            </SectionCard>
          </div>
        </Modal>
      )}

      {debug && (
        <Modal
          title={`دیباگر پیکربندی — ${debug.group.title ?? debug.group.id}`}
          icon="search"
          onClose={() => setDebug(null)}
          wide
        >
          <div className="col">
            <Notice kind="info" title="ترتیب لایه‌ها">
              مقادیر از بالا به پایین روی هم نوشته می‌شوند؛ آخرین لایه بالاترین اولویت را دارد.
            </Notice>
            {debug.resolution.map((layer, i) => (
              <SectionCard
                key={i}
                icon="layers"
                title={layer.layer}
                subtitle={`منبع: ${layer.source}`}
                actions={<span className="badge neutral">لایهٔ {fmtNum(i + 1)}</span>}
              >
                <CodeBlock copyable compact>{JSON.stringify(layer.values, null, 2)}</CodeBlock>
              </SectionCard>
            ))}
          </div>
        </Modal>
      )}

      {bulkConfirm && (
        <ConfirmDialog
          title="مسدودسازی گروه‌ها"
          message={`آیا مطمئن هستید که می‌خواهید ${fmtNum(selected.size)} گروه را مسدود کنید؟ ربات در این گروه‌ها دیگر فعال نخواهد بود.`}
          confirmLabel="مسدود کن"
          onConfirm={() => { setBulkConfirm(false); doBulk(); }}
          onClose={() => setBulkConfirm(false)}
        />
      )}
    </div>
  );
}

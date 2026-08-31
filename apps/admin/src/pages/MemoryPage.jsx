import { useCallback, useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { fmtNum, fmtTime, t } from '../lib/i18n.js';
import {
  DataTable, Modal, ConfirmDialog, PageHeader, SectionCard, Toolbar,
  SearchInput, Field, Slider, IconButton, List, ListRow, EmptyState, Notice,
} from '../components/ui.jsx';
import { useStore } from '../state/store.jsx';
import { Icon } from '../components/icons.jsx';

const SCOPE_LABEL = { user: 'کاربر', group: 'گروه', global: 'سراسری' };
const TYPE_LABEL = {
  fact: 'واقعیت', preference: 'ترجیح', event: 'رخداد',
  relationship: 'رابطه', skill: 'مهارت', other: 'سایر',
};
const SOURCE_LABEL = {
  extraction: 'استخراج هوش مصنوعی', explicit: 'گفتهٔ خود کاربر', admin: 'ثبت مدیر',
};

const pct = (v) => `${fmtNum(Math.round(Number(v ?? 0) * 100))}٪`;

function importanceKind(v) {
  const n = Number(v ?? 0);
  if (n >= 0.75) return 'danger';
  if (n >= 0.5) return 'warning';
  if (n >= 0.25) return 'info';
  return 'neutral';
}

export function MemoryPage() {
  const { toast } = useStore();
  const [rows, setRows] = useState(null);
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState(null);
  const [content, setContent] = useState('');
  const [importance, setImportance] = useState(0.5);
  const [deleting, setDeleting] = useState(null);
  const [debug, setDebug] = useState(null);
  const [debugText, setDebugText] = useState('');
  const [debugBusy, setDebugBusy] = useState(false);

  const runDebug = async () => {
    if (!debugText.trim()) return;
    setDebugBusy(true);
    try { setDebug(await api('/debug/memory', { method: 'POST', body: { text: debugText } })); }
    catch (err) { toast(err.message, 'error'); }
    finally { setDebugBusy(false); }
  };

  const load = useCallback(async () => {
    try { setRows(await api(`/memories?search=${encodeURIComponent(search)}`)); }
    catch (err) { toast(err.message, 'error'); }
  }, [search, toast]);
  useEffect(() => { load(); }, [load]);

  const save = async () => {
    try {
      await api(`/memories/${editing.id}`, { method: 'PATCH', body: { content, importance: Number(importance) } });
      toast(t('saved'), 'success'); setEditing(null); load();
    } catch (err) { toast(err.message, 'error'); }
  };
  const remove = async () => {
    try {
      await api(`/memories/${deleting.id}`, { method: 'DELETE' });
      toast(t('deleted'), 'success'); setDeleting(null); load();
    } catch (err) { toast(err.message, 'error'); }
  };

  return (
    <div className="page">
      <PageHeader
        icon="memory"
        title={t('memory')}
        subtitle="حافظهٔ بلندمدت ربات — با جداسازی کامل میان گروه‌ها و کاربران"
        actions={(
          <button className="btn sm" onClick={load}>
            <Icon name="refresh" size={13} /> {t('refresh')}
          </button>
        )}
      />

      <SectionCard
        icon="search"
        title="دیباگر بازیابی حافظه"
        subtitle="یک پیام نمونه بنویسید تا ببینید ربات چه چیزی از حافظه بازیابی می‌کند"
      >
        <div className="row">
          <div className="spacer">
            <SearchInput
              value={debugText}
              onChange={setDebugText}
              onEnter={runDebug}
              placeholder="مثلاً: سلام صبحت بخیر — چه چیزی بازیابی می‌شود؟"
            />
          </div>
          <button className="btn primary" onClick={runDebug} disabled={debugBusy || !debugText.trim()}>
            <Icon name={debugBusy ? 'refresh' : 'play'} size={14} /> تست بازیابی
          </button>
        </div>

        {debug && (
          <div className="mt-lg col">
            <Notice
              kind={debug.queryEmbeddingUsed ? 'good' : 'warn'}
              icon={debug.queryEmbeddingUsed ? 'checkCircle' : 'alert'}
              title={debug.queryEmbeddingUsed ? 'جست‌وجوی معنایی فعال بود' : 'جست‌وجوی معنایی در دسترس نبود'}
            >
              {debug.queryEmbeddingUsed
                ? 'بردار معنایی پیام ساخته شد و شباهت معنایی محاسبه گردید.'
                : 'مدل embedding پاسخ نداد؛ رتبه‌بندی بر پایهٔ اهمیت و تازگی انجام شد.'}
            </Notice>

            {debug.results.length === 0 ? (
              <EmptyState icon="memory" title="چیزی بازیابی نشد"
                text="برای این پیام هیچ خاطره‌ای به آستانهٔ بازیابی نرسید." />
            ) : (
              <List bordered>
                {debug.results.map((r) => (
                  <ListRow
                    key={r.id}
                    icon="memory"
                    title={r.content}
                    subtitle={`${SCOPE_LABEL[r.scope] ?? r.scope} · ${TYPE_LABEL[r.type] ?? r.type} · ${r.reason}`}
                    end={(
                      <div className="row tight">
                        <span className="badge primary">امتیاز {r.score}</span>
                        {r.similarity != null && <span className="badge neutral">شباهت {r.similarity}</span>}
                      </div>
                    )}
                  />
                ))}
              </List>
            )}
          </div>
        )}
      </SectionCard>

      <Toolbar>
        <SearchInput value={search} onChange={setSearch} placeholder={t('search')} onEnter={load} />
        <div className="spacer" />
        {rows && <span className="faint sm">{fmtNum(rows.length)} خاطره</span>}
      </Toolbar>

      <DataTable
        loading={!rows}
        rows={rows}
        emptyIcon="memory"
        emptyText="هنوز حافظه‌ای ثبت نشده است"
        columns={[
          {
            key: 'content', label: t('col_content'), width: '40%', cellClass: 'cell-clip',
            render: (m) => <span className="clamp-2" title={m.content}>{m.content}</span>,
          },
          {
            key: 'scope', label: t('col_scope'),
            render: (m) => <span className="badge primary">{SCOPE_LABEL[m.scope] ?? m.scope}</span>,
          },
          {
            key: 'type', label: t('col_type'),
            render: (m) => <span className="muted sm">{TYPE_LABEL[m.type] ?? m.type ?? '—'}</span>,
          },
          {
            key: 'importance', label: t('col_importance'), sortValue: (m) => Number(m.importance ?? 0),
            render: (m) => <span className={`badge ${importanceKind(m.importance)}`}>{pct(m.importance)}</span>,
          },
          {
            key: 'source', label: t('col_source'),
            render: (m) => <span className="badge neutral">{SOURCE_LABEL[m.source] ?? m.source}</span>,
          },
          {
            key: 'updated_at', label: t('col_updated'),
            render: (m) => <span className="muted sm ltr">{fmtTime(m.updated_at)}</span>,
          },
          {
            key: 'actions', label: t('actions'), sortable: false, cellClass: 'actions-cell',
            render: (m) => (
              <>
                <IconButton icon="edit" title={t('edit')} onClick={() => {
                  setEditing(m); setContent(m.content); setImportance(Number(m.importance ?? 0.5));
                }} />
                <IconButton icon="trash" title={t('delete')} danger onClick={() => setDeleting(m)} />
              </>
            ),
          },
        ]}
      />

      {editing && (
        <Modal
          title="ویرایش حافظه"
          icon="edit"
          onClose={() => setEditing(null)}
          footer={(
            <>
              <div className="spacer" />
              <button className="btn" onClick={() => setEditing(null)}>{t('cancel')}</button>
              <button className="btn primary" onClick={save} disabled={!content.trim()}>{t('save')}</button>
            </>
          )}
        >
          <div className="col">
            <div className="row wrap tight">
              <span className="badge primary">{SCOPE_LABEL[editing.scope] ?? editing.scope}</span>
              <span className="badge neutral">{TYPE_LABEL[editing.type] ?? editing.type}</span>
              <span className="badge info">{SOURCE_LABEL[editing.source] ?? editing.source}</span>
            </div>

            <Field label="محتوای خاطره" hint="متنی که ربات به‌عنوان دانش دربارهٔ این کاربر یا گروه نگه می‌دارد.">
              <textarea className="textarea" rows={5} value={content}
                onChange={(e) => setContent(e.target.value)} />
            </Field>

            <Slider
              label="اهمیت"
              value={Number(importance)}
              min={0} max={1} step={0.05}
              onChange={setImportance}
              format={(v) => pct(v)}
            />
          </div>
        </Modal>
      )}

      {deleting && (
        <ConfirmDialog
          title="حذف خاطره"
          message={`آیا از حذف «${String(deleting.content).slice(0, 70)}…» مطمئن هستید؟ این عمل بازگشت‌پذیر نیست.`}
          confirmLabel={t('delete')}
          onConfirm={remove}
          onClose={() => setDeleting(null)}
        />
      )}
    </div>
  );
}

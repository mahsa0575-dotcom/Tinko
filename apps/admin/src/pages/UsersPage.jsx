import { useCallback, useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { fmtNum, fmtTime, t } from '../lib/i18n.js';
import {
  DataTable, StatusBadge, Modal, PageHeader, Toolbar, SearchInput, IconButton,
  List, ListRow, EmptyState, Avatar, ConfirmDialog,
} from '../components/ui.jsx';
import { useStore } from '../state/store.jsx';
import { Icon } from '../components/icons.jsx';

const SOURCE_LABEL = { extraction: 'استخراج هوش مصنوعی', explicit: 'گفتهٔ خود کاربر', admin: 'ثبت مدیر' };
const SCOPE_LABEL = { user: 'کاربر', group: 'گروه', global: 'سراسری' };

const fullName = (u) =>
  [u?.first_name, u?.last_name].filter(Boolean).join(' ') || u?.username || String(u?.telegram_id ?? '—');

export function UsersPage() {
  const { toast } = useStore();
  const [rows, setRows] = useState(null);
  const [search, setSearch] = useState('');
  const [memories, setMemories] = useState(null);
  const [confirm, setConfirm] = useState(null);

  const load = useCallback(async () => {
    try { setRows(await api(`/users?search=${encodeURIComponent(search)}`)); }
    catch (err) { toast(err.message, 'error'); }
  }, [search, toast]);
  useEffect(() => { load(); }, [load]);

  const setStatus = async (user, status) => {
    try {
      await api(`/users/${user.id}/status`, { method: 'PATCH', body: { status } });
      toast(t('saved'), 'success');
      load();
    } catch (err) { toast(err.message, 'error'); }
  };

  const openMemories = async (user) => {
    try {
      setMemories({ user, rows: await api(`/users/${user.id}/memories`) });
    } catch (err) { toast(err.message, 'error'); }
  };

  const deleteMemory = async (m) => {
    try {
      await api(`/memories/${m.id}`, { method: 'DELETE' });
      setMemories((prev) => ({ ...prev, rows: prev.rows.filter((r) => r.id !== m.id) }));
      toast(t('deleted'), 'success');
    } catch (err) { toast(err.message, 'error'); }
  };

  return (
    <div className="page">
      <PageHeader
        icon="user"
        title={t('users')}
        subtitle="همهٔ کاربرانی که ربات با آن‌ها تعامل داشته، همراه با تعداد پاسخ‌های هوش مصنوعی و حافظهٔ ذخیره‌شده"
        actions={<button className="btn sm" onClick={load}><Icon name="refresh" size={13} />{t('refresh')}</button>}
      />

      <Toolbar>
        <SearchInput value={search} onChange={setSearch} placeholder="جستجوی نام، نام کاربری یا شناسه تلگرام…" onEnter={load} />
        <div className="toolbar-sep" />
        <span className="muted sm nowrap">{rows ? `${fmtNum(rows.length)} کاربر` : t('loading')}</span>
      </Toolbar>

      <DataTable
        loading={!rows}
        rows={rows}
        emptyIcon="user"
        emptyText="هنوز کاربری ثبت نشده است"
        columns={[
          {
            key: 'first_name',
            label: t('col_name'),
            render: (u) => (
              <div className="row tight">
                <Avatar name={fullName(u)} size="sm" />
                <div className="col tight">
                  <span className="cell-strong">{fullName(u)}</span>
                  {u.username && <span className="faint mono xs ltr">@{u.username}</span>}
                </div>
              </div>
            ),
          },
          { key: 'telegram_id', label: t('col_telegram_id'), render: (u) => <span className="mono xs">{u.telegram_id}</span> },
          { key: 'message_count', label: t('col_messages'), render: (u) => <span className="num">{fmtNum(u.message_count)}</span> },
          { key: 'ai_requests', label: 'پاسخ هوش مصنوعی', render: (u) => <span className="num">{fmtNum(u.ai_requests)}</span> },
          {
            key: 'memory_count',
            label: t('memory'),
            render: (u) => (
              <span className={`badge ${u.memory_count ? 'info' : 'neutral'}`}>{fmtNum(u.memory_count ?? 0)}</span>
            ),
          },
          { key: 'status', label: t('status'), render: (u) => <StatusBadge value={u.status} /> },
          { key: 'last_seen_at', label: t('col_last_seen'), render: (u) => <span className="nowrap xs">{fmtTime(u.last_seen_at)}</span> },
          {
            key: 'actions',
            label: t('actions'),
            sortable: false,
            cellClass: 'actions-cell',
            render: (u) => (
              <div className="row tight">
                <IconButton small icon="memory" title="حافظهٔ کاربر" onClick={() => openMemories(u)} />
                {u.status === 'active' ? (
                  <IconButton small icon="eyeOff" title="نادیده‌گرفتن پیام‌ها (حالت شادو)"
                    onClick={() => setStatus(u, 'shadow_ignored')} />
                ) : (
                  <IconButton small icon="check" title="فعال‌سازی مجدد" onClick={() => setStatus(u, 'active')} />
                )}
                <IconButton small danger icon="ban" title="مسدودسازی کاربر"
                  onClick={() => setConfirm({
                    title: 'مسدودسازی کاربر',
                    message: `«${fullName(u)}» مسدود شود؟ ربات دیگر به پیام‌های این کاربر پاسخ نخواهد داد.`,
                    label: 'مسدود کن',
                    run: () => setStatus(u, 'blocked'),
                  })} />
              </div>
            ),
          },
        ]}
      />

      {memories && (
        <Modal
          wide
          icon="memory"
          title={`حافظهٔ «${fullName(memories.user)}»`}
          onClose={() => setMemories(null)}
          footer={<><div className="spacer" /><button className="btn" onClick={() => setMemories(null)}>{t('close')}</button></>}
        >
          <p className="muted sm">
            هر چیزی که ربات دربارهٔ این کاربر به‌یاد دارد — دستوری («یادت باشد» / «فراموش کن»)،
            استخراج خودکار با هوش مصنوعی، یا ثبت‌شده توسط مدیر.
          </p>

          {memories.rows.length === 0 ? (
            <EmptyState icon="memory" title="حافظه‌ای ثبت نشده است"
              text="هنوز چیزی از گفت‌وگوهای این کاربر در حافظهٔ بلندمدت ذخیره نشده است." />
          ) : (
            <List bordered>
              {memories.rows.map((m) => (
                <ListRow
                  key={m.id}
                  icon="sparkles"
                  iconColor="var(--accent-2)"
                  end={
                    <>
                      <StatusBadge value={m.status} />
                      <IconButton small danger icon="trash" title={t('delete')} onClick={() => deleteMemory(m)} />
                    </>
                  }
                >
                  <div className="sm" style={{ lineHeight: 'var(--lh-snug)' }}>{m.content}</div>
                  <div className="faint xs row tight wrap mt">
                    <span className="badge neutral">{SCOPE_LABEL[m.scope] ?? m.scope} / {m.type}</span>
                    <span className="badge info">اهمیت {fmtNum(Math.round((m.importance ?? 0) * 100))}٪</span>
                    <span>{SOURCE_LABEL[m.source] ?? m.source}</span>
                    <span>·</span>
                    <span>{fmtTime(m.updated_at)}</span>
                  </div>
                </ListRow>
              ))}
            </List>
          )}
        </Modal>
      )}

      {confirm && (
        <ConfirmDialog
          title={confirm.title}
          message={confirm.message}
          confirmLabel={confirm.label}
          onConfirm={confirm.run}
          onClose={() => setConfirm(null)}
        />
      )}
    </div>
  );
}

import { useCallback, useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { fmtNum, fmtTime, t } from '../lib/i18n.js';
import { DataTable, StatusBadge, Modal } from '../components/ui.jsx';
import { useStore } from '../state/store.jsx';

export function UsersPage() {
  const { toast } = useStore();
  const [rows, setRows] = useState(null);
  const [search, setSearch] = useState('');
  const [memories, setMemories] = useState(null);   // {user, rows}

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
      const list = await api(`/users/${user.id}/memories`);
      setMemories({ user, rows: list });
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
      <h1 className="page-title">🙋 {t('users')}</h1>
      <p className="page-subtitle">{rows ? `${fmtNum(rows.length)} کاربر` : t('loading')} — همه‌ی کاربرانی که ربات با آن‌ها تعامل داشته، همراه تعداد پاسخ‌های AI و حافظه‌شان</p>
      <div className="row" style={{ marginBottom: 14 }}>
        <input className="input" style={{ maxWidth: 280 }} placeholder={t('search')}
          value={search} onChange={(e) => setSearch(e.target.value)} />
        <div className="spacer" />
        <button className="btn" onClick={load}>🔄 {t('refresh')}</button>
      </div>
      <DataTable loading={!rows} rows={rows} emptyText="هنوز کاربری ثبت نشده است"
        columns={[
          { key: 'first_name', label: 'Name', render: (u) => (
            <div style={{ fontWeight: 600 }}>
              {[u.first_name, u.last_name].filter(Boolean).join(' ') || '—'}
              {u.username && <span className="faint mono" style={{ fontSize: 11 }}> @{u.username}</span>}
            </div>
          )},
          { key: 'telegram_id', label: 'Telegram ID', render: (u) => <span className="mono">{u.telegram_id}</span> },
          { key: 'message_count', label: 'Messages', render: (u) => fmtNum(u.message_count) },
          { key: 'ai_requests', label: 'پاسخ‌های AI', render: (u) => fmtNum(u.ai_requests) },
          { key: 'memory_count', label: '🧠 حافظه', render: (u) => fmtNum(u.memory_count) },
          { key: 'status', label: t('status'), render: (u) => <StatusBadge value={u.status} /> },
          { key: 'last_seen_at', label: 'Last seen', render: (u) => fmtTime(u.last_seen_at) },
          { key: 'actions', label: t('actions'), sortable: false, render: (u) => (
            <div className="row">
              <button className="btn sm" title="حافظه‌ی کاربر" onClick={() => openMemories(u)}>🧠</button>
              {u.status === 'active'
                ? <button className="btn sm" onClick={() => setStatus(u, 'shadow_ignored')}>🙈</button>
                : <button className="btn sm" onClick={() => setStatus(u, 'active')}>✅</button>}
              <button className="btn sm danger" onClick={() => setStatus(u, 'blocked')}>⛔</button>
            </div>
          )},
        ]}
      />

      {memories && (
        <Modal title={`🧠 حافظه‌ی ${[memories.user.first_name, memories.user.last_name].filter(Boolean).join(' ') || memories.user.username || memories.user.telegram_id}`}
          onClose={() => setMemories(null)} wide>
          <p className="muted" style={{ fontSize: 12 }}>
            هر چیزی که ربات درباره‌ی این کاربر به‌یاد دارد — دستوری («یادت باشد»/«فراموش کن»)، استخراج خودکار با AI، یا ثبت‌شده توسط ادمین.
          </p>
          {memories.rows.length === 0 && (
            <div className="empty"><div className="empty-icon">🧠</div>
              <div className="empty-title">هیچ حافظه‌ای برای این کاربر ثبت نشده است</div></div>
          )}
          {memories.rows.map((m) => (
            <div key={m.id} className="row" style={{ justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13 }}>{m.content}</div>
                <div className="faint" style={{ fontSize: 11 }}>
                  {m.scope}/{m.type} · اهمیت {fmtNum(Math.round(m.importance * 100))}٪ · منبع: {m.source === 'extraction' ? 'استخراج AI' : m.source === 'explicit' ? 'خود کاربر' : 'ادمین'} · {fmtTime(m.updated_at)}
                </div>
              </div>
              <div className="row">
                <StatusBadge value={m.status} />
                <button className="btn sm danger" onClick={() => deleteMemory(m)}>🗑</button>
              </div>
            </div>
          ))}
        </Modal>
      )}
    </div>
  );
}

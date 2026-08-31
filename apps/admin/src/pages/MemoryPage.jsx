import { useCallback, useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { fmtNum, fmtTime, t } from '../lib/i18n.js';
import { DataTable, Modal, ConfirmDialog } from '../components/ui.jsx';
import { useStore } from '../state/store.jsx';

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

  const runDebug = async () => {
    if (!debugText.trim()) return;
    try { setDebug(await api('/debug/memory', { method: 'POST', body: { text: debugText } })); }
    catch (err) { toast(err.message, 'error'); }
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
      <h1 className="page-title">🧠 {t('memory')}</h1>
      <p className="page-subtitle">حافظه‌ی بلندمدت — جداسازی دقیق بین گروه‌ها و کاربران</p>
      <div className="row" style={{ marginBottom: 14 }}>
        <input className="input" style={{ maxWidth: 280 }} placeholder={t('search')}
          value={search} onChange={(e) => setSearch(e.target.value)} />
        <div className="spacer" />
        <button className="btn" onClick={load}>🔄 {t('refresh')}</button>
      </div>

      {/* Memory debugger (spec §120) */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-title">🔍 دیباگر بازیابی حافظه</div>
        <div className="row">
          <input className="input" placeholder="مثلاً: سلام صبحت بخیر — چه چیزی بازیابی می‌شود؟"
            value={debugText} onChange={(e) => setDebugText(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && runDebug()} />
          <button className="btn primary" onClick={runDebug}>تست بازیابی</button>
        </div>
        {debug && (
          <div className="mt">
            <span className="badge info">embedding: {debug.queryEmbeddingUsed ? 'استفاده شد' : 'در دسترس نبود — رتبه‌بندی اهمیت/تازگی'}</span>
            <div className="mt">
              {debug.results.length === 0 && <span className="muted">چیزی بازیابی نشد</span>}
              {debug.results.map((r) => (
                <div key={r.id} className="row" style={{ justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--border)', fontSize: 12 }}>
                  <span style={{ flex: 1 }}>{r.content}</span>
                  <span className="badge primary">score {r.score}</span>
                  {r.similarity != null && <span className="badge neutral">sim {r.similarity}</span>}
                  <span className="faint mono" style={{ fontSize: 10 }}>{r.scope}/{r.type} · {r.reason}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
      <DataTable loading={!rows} rows={rows} emptyText="هنوز حافظه‌ای ثبت نشده است"
        columns={[
          { key: 'content', label: 'Content', render: (m) => (
            <div style={{ maxWidth: 420 }}>{m.content}</div>
          )},
          { key: 'scope', label: 'Scope', render: (m) => <span className="badge primary">{m.scope}</span> },
          { key: 'type', label: 'Type' },
          { key: 'importance', label: 'Importance', render: (m) => fmtNum(Math.round(m.importance * 100)) + '٪' },
          { key: 'source', label: 'Source', render: (m) => <span className="badge neutral">{m.source}</span> },
          { key: 'updated_at', label: 'Updated', render: (m) => fmtTime(m.updated_at) },
          { key: 'actions', label: t('actions'), sortable: false, render: (m) => (
            <div className="row">
              <button className="btn sm" onClick={() => { setEditing(m); setContent(m.content); setImportance(m.importance); }}>✏️</button>
              <button className="btn sm danger" onClick={() => setDeleting(m)}>🗑</button>
            </div>
          )},
        ]}
      />

      {editing && (
        <Modal title="ویرایش حافظه" onClose={() => setEditing(null)}>
          <div className="field"><label>محتوا</label>
            <textarea className="textarea" value={content} onChange={(e) => setContent(e.target.value)} /></div>
          <div className="field"><label>اهمیت: {fmtNum(Math.round(importance * 100))}٪</label>
            <input type="range" min="0" max="1" step="0.05" value={importance}
              onChange={(e) => setImportance(e.target.value)} /></div>
          <div className="row" style={{ justifyContent: 'flex-end' }}>
            <button className="btn" onClick={() => setEditing(null)}>{t('cancel')}</button>
            <button className="btn primary" onClick={save}>{t('save')}</button>
          </div>
        </Modal>
      )}
      {deleting && (
        <ConfirmDialog title={t('delete')} message={`${t('confirm_delete')} «${deleting.content.slice(0, 60)}…»`}
          onConfirm={remove} onClose={() => setDeleting(null)} />
      )}
    </div>
  );
}

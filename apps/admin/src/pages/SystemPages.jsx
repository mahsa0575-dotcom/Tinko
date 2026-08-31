import { useCallback, useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { fmtTime, t } from '../lib/i18n.js';
import { DataTable } from '../components/ui.jsx';
import { useStore } from '../state/store.jsx';
import { Icon } from '../components/icons.jsx';

export function AuditPage() {
  const { toast } = useStore();
  const [rows, setRows] = useState(null);
  const load = useCallback(() => api('/audit?limit=100').then(setRows).catch((e) => toast(e.message, 'error')), [toast]);
  useEffect(() => { load(); }, [load]);

  return (
    <div className="page">
      <div className="row">
        <h1 className="page-title"><span className="title-icon"><Icon name="file" size={20} /></span>{t('audit')}</h1>
        <div className="spacer" />
        <button className="btn" onClick={load}><Icon name="refresh" size={14} /> {t('refresh')}</button>
      </div>
      <p className="page-subtitle">تمام اقدامات مدیریتی به‌صورت تغییرناپذیر ثبت می‌شوند (بدون ذخیره‌ی رمزها)</p>
      <DataTable loading={!rows} rows={rows} emptyText="رخدادی ثبت نشده است"
        columns={[
          { key: 'created_at', label: 'Time', render: (r) => fmtTime(r.created_at) },
          { key: 'actor_email', label: 'Actor', render: (r) => r.actor_email ?? r.actor_kind },
          { key: 'action', label: 'Action', render: (r) => <span className="mono">{r.action}</span> },
          { key: 'entity_type', label: 'Entity', render: (r) => r.entity_type ? `${r.entity_type}#${r.entity_id ?? ''}` : '—' },
          { key: 'ip', label: 'IP', render: (r) => <span className="mono">{r.ip ?? '—'}</span> },
        ]}
      />
    </div>
  );
}

export function NotificationsPage() {
  const { toast } = useStore();
  const [rows, setRows] = useState(null);
  const load = useCallback(() => api('/notifications').then(setRows).catch((e) => toast(e.message, 'error')), [toast]);
  useEffect(() => { load(); }, [load]);

  const acknowledge = async (n) => {
    try { await api(`/notifications/${n.id}/acknowledge`, { method: 'POST' }); load(); }
    catch (err) { toast(err.message, 'error'); }
  };

  return (
    <div className="page">
      <div className="row">
        <h1 className="page-title"><span className="title-icon"><Icon name="bell" size={20} /></span>{t('notifications')}</h1>
        <div className="spacer" />
        <button className="btn" onClick={load}><Icon name="refresh" size={14} /> {t('refresh')}</button>
      </div>
      <div className="grid mt">
        {(rows ?? []).map((n) => (
          <div key={n.id} className="card row">
            <Icon name={n.level === 'critical' || n.level === 'warning' ? 'alert' : 'info'} size={20} style={{ color: n.level === 'critical' ? 'var(--danger)' : n.level === 'warning' ? 'var(--warning)' : 'var(--info)' }} />
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700 }}>{n.title}</div>
              <div className="muted" style={{ fontSize: 12 }}>{n.body}</div>
              <div className="faint" style={{ fontSize: 11 }}>{fmtTime(n.created_at)} · {n.channel}</div>
            </div>
            {n.status === 'new' && <button className="btn sm" onClick={() => acknowledge(n)}><Icon name="check" size={13} /> بررسی شد</button>}
          </div>
        ))}
        {rows && rows.length === 0 && (
          <div className="card"><div className="empty"><div className="empty-icon"><Icon name="bell" size={24} /></div>
            <div className="empty-title">اعلانی وجود ندارد</div></div></div>
        )}
      </div>
    </div>
  );
}

export function HealthPage() {
  const { toast } = useStore();
  const [health, setHealth] = useState(null);
  const [diag, setDiag] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => api('/system/health').then(setHealth).catch((e) => toast(e.message, 'error')), [toast]);
  useEffect(() => { load(); const h = setInterval(load, 10_000); return () => clearInterval(h); }, [load]);

  const runDiagnostics = async () => {
    setBusy(true);
    try { setDiag(await api('/system/diagnostics', { method: 'GET' })); }
    catch (err) { toast(err.message, 'error'); }
    finally { setBusy(false); }
  };

  return (
    <div className="page">
      <div className="row">
        <h1 className="page-title"><span className="title-icon"><Icon name="heart" size={20} /></span>{t('health')}</h1>
        <div className="spacer" />
        <button className="btn primary" onClick={runDiagnostics} disabled={busy}>
          {busy ? t('loading') : <><Icon name="activity" size={14} /> اجرای عیب‌یابی</>}
        </button>
      </div>

      <div className="grid grid-2 mt">
        <div className="card">
          <div className="card-title"><Icon name="globe" size={14} /> سرویس‌ها</div>
          {(health?.services ?? []).map((s) => (
            <div key={s.service} className="row" style={{ justifyContent: 'space-between', padding: '6px 0' }}>
              <span className="mono">{s.service}</span>
              <span className="status-pill">
                <span className={`pulse ${s.status === 'online' ? 'ok' : s.status === 'degraded' ? 'warn' : 'bad'}`} />
                {s.status}
              </span>
            </div>
          ))}
          {!health && <div className="skeleton" style={{ height: 80 }} />}
          {health && (
            <div className="muted mt" style={{ fontSize: 12 }}>
              DB: {health.database?.latencyMs}ms · Redis: {health.redis?.ok ? `${health.redis.latencyMs}ms` : '—'} ·
              version {health.version} · {health.environment}
            </div>
          )}
        </div>
        <div className="card">
          <div className="card-title"><Icon name="zap" size={14} /> Circuit Breakerهای تأمین‌کنندگان</div>
          {(health?.circuitBreakers ?? []).length === 0 && <div className="muted">همه سالم هستند (بدون رخداد)</div>}
          {(health?.circuitBreakers ?? []).map((b) => (
            <div key={b.providerId} className="row" style={{ justifyContent: 'space-between', padding: '6px 0' }}>
              <span className="mono">provider #{b.providerId}</span>
              <span className={`badge ${b.state === 'closed' ? 'success' : b.state === 'half_open' ? 'warning' : 'danger'}`}>{b.state}</span>
            </div>
          ))}
        </div>
      </div>

      {diag && (
        <div className="card mt">
          <div className="card-title"><Icon name="activity" size={14} /> نتیجه‌ی عیب‌یابی</div>
          {diag.checks.map((c) => (
            <div key={c.name} className="row" style={{ justifyContent: 'space-between', padding: '6px 0' }}>
              <span className="mono">{c.name}</span>
              <span className={`badge ${c.ok ? 'success' : 'danger'}`}>{c.ok ? `OK · ${c.latencyMs}ms` : c.error}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { fmtNum, t } from '../lib/i18n.js';
import { MetricCard, Chart, StatusBadge } from '../components/ui.jsx';
import { useStore } from '../state/store.jsx';

export function DashboardPage() {
  const { toast } = useStore();
  const [summary, setSummary] = useState(null);
  const [series, setSeries] = useState(null);
  const [resources, setResources] = useState(null);
  const [health, setHealth] = useState(null);

  useEffect(() => {
    api('/analytics/summary').then(setSummary).catch((e) => toast(e.message, 'error'));
    api('/analytics/timeseries?metric=ai_requests&hours=24').then(setSeries).catch(() => {});
    api('/resources/latest').then(setResources).catch(() => {});
    api('/system/health').then(setHealth).catch(() => {});
  }, [toast]);

  const cpuPct = resources?.available ? Math.round(resources.cpu_percent) : null;
  const ramPct = resources?.available ? Math.round((resources.mem_used / resources.mem_total) * 100) : null;
  const diskPct = resources?.available && resources.disks?.length
    ? Math.max(...resources.disks.map((d) => d.pct ?? 0)) : null;

  return (
    <div className="page">
      <h1 className="page-title">📊 {t('dashboard')}</h1>
      <p className="page-subtitle">{t('last_24h')}</p>

      <div className="grid grid-cards" style={{ marginBottom: 20 }}>
        <MetricCard icon="👥" label={t('total_groups')} value={fmtNum(summary?.groups?.total ?? 0)} hint={`${t('active_groups')}: ${fmtNum(summary?.groups?.active_24h ?? 0)}`} />
        <MetricCard icon="🙋" label={t('total_users')} value={fmtNum(summary?.users?.total ?? 0)} hint={`${t('active_users')}: ${fmtNum(summary?.users?.active_24h ?? 0)}`} />
        <MetricCard icon="🤖" label={t('ai_requests')} value={fmtNum(summary?.usage?.requests ?? 0)} accent="var(--info)" />
        <MetricCard icon="🎫" label={t('tokens')} value={fmtNum(Number(summary?.usage?.tokens_in ?? 0) + Number(summary?.usage?.tokens_out ?? 0))} />
        <MetricCard icon="💰" label={t('cost')} value={`$${Number(summary?.usage?.cost ?? 0).toFixed(2)}`} accent="var(--warning)" />
        <MetricCard icon="💬" label={t('messages_24h')} value={fmtNum(summary?.messages24h ?? 0)} />
        <MetricCard icon="⚡" label={t('avg_latency')} value={fmtNum(summary?.usage?.avg_latency_ms ?? 0)} hint="ms" />
        <MetricCard icon="🚨" label={t('errors')} value={fmtNum(summary?.usage?.errors ?? 0)} accent="var(--danger)" />
        <MetricCard icon="🖥️" label={t('cpu')} value={cpuPct != null ? `${fmtNum(cpuPct)}٪` : t('unavailable')} />
        <MetricCard icon="🧠" label={t('ram')} value={ramPct != null ? `${fmtNum(ramPct)}٪` : t('unavailable')} />
        <MetricCard icon="💾" label={t('disk')} value={diskPct != null ? `${fmtNum(diskPct)}٪` : t('unavailable')} />
      </div>

      <div className="grid grid-2">
        <div className="card">
          <div className="card-title">🤖 {t('ai_requests')} — 24h</div>
          <Chart data={(series ?? []).map((r) => r.value)} height={140} />
        </div>
        <div className="card">
          <div className="card-title">💚 {t('services')}</div>
          {(health?.services ?? []).length
            ? <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))' }}>
                {health.services.map((s) => (
                  <div key={s.service} className="row" style={{ justifyContent: 'space-between' }}>
                    <span className="mono">{s.service}</span><StatusBadge value={s.status} />
                  </div>
                ))}
              </div>
            : <div className="empty"><div className="empty-icon">📡</div><div className="muted">{t('no_data')}</div></div>}
          {health && (
            <div className="row mt" style={{ fontSize: 12 }} >
              <span className="muted">DB: {fmtNum(health.database?.latencyMs)}ms</span>
              <span className="muted">Redis: {health.redis?.ok ? `${fmtNum(health.redis.latencyMs)}ms` : '—'}</span>
              <span className="spacer" />
              <StatusBadge value={health.status === 'healthy' ? 'healthy' : 'degraded'} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

import { useCallback, useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { fmtNum, t } from '../lib/i18n.js';
import { MetricCard, Chart, StatusBadge, PageHeader } from '../components/ui.jsx';
import { Icon } from '../components/icons.jsx';
import { useStore } from '../state/store.jsx';

export function DashboardPage() {
  const { toast } = useStore();
  const [summary, setSummary] = useState(null);
  const [series, setSeries] = useState(null);
  const [resources, setResources] = useState(null);
  const [health, setHealth] = useState(null);

  const load = useCallback(() => {
    api('/analytics/summary').then(setSummary).catch((e) => toast(e.message, 'error'));
    api('/analytics/timeseries?metric=ai_requests&hours=24').then(setSeries).catch(() => {});
    api('/resources/latest').then(setResources).catch(() => {});
    api('/system/health').then(setHealth).catch(() => {});
  }, [toast]);

  useEffect(() => {
    load();
    const timer = setInterval(load, 30_000);
    return () => clearInterval(timer);
  }, [load]);

  const cpuPct = resources?.available ? Math.round(resources.cpu_percent) : null;
  const ramPct = resources?.available ? Math.round((resources.mem_used / resources.mem_total) * 100) : null;
  const diskPct = resources?.available && resources.disks?.length
    ? Math.max(...resources.disks.map((d) => d.pct ?? 0)) : null;

  return (
    <div className="page">
      <PageHeader icon="dashboard" title={t('dashboard')} subtitle={t('last_24h')}
        actions={<button className="btn sm" onClick={load}><Icon name="refresh" size={13} /> {t('refresh')}</button>} />

      <div className="grid grid-cards" style={{ marginBottom: 20 }}>
        <MetricCard icon="users" label={t('total_groups')} value={fmtNum(summary?.groups?.total ?? 0)} hint={`${t('active_groups')}: ${fmtNum(summary?.groups?.active_24h ?? 0)}`} />
        <MetricCard icon="user" label={t('total_users')} value={fmtNum(summary?.users?.total ?? 0)} hint={`${t('active_users')}: ${fmtNum(summary?.users?.active_24h ?? 0)}`} />
        <MetricCard icon="bot" label={t('ai_requests')} value={fmtNum(summary?.usage?.requests ?? 0)} accent="var(--info)" />
        <MetricCard icon="zap" label={t('tokens')} value={fmtNum(Number(summary?.usage?.tokens_in ?? 0) + Number(summary?.usage?.tokens_out ?? 0))} />
        <MetricCard icon="dollar" label={t('cost')} value={`$${Number(summary?.usage?.cost ?? 0).toFixed(2)}`} accent="var(--warning)" />
        <MetricCard icon="message" label={t('messages_24h')} value={fmtNum(summary?.messages24h ?? 0)} />
        <MetricCard icon="clock" label={t('avg_latency')} value={fmtNum(summary?.usage?.avg_latency_ms ?? 0)} hint="ms" />
        <MetricCard icon="alert" label={t('errors')} value={fmtNum(summary?.usage?.errors ?? 0)} accent="var(--danger)" />
        <MetricCard icon="cpu" label={t('cpu')} value={cpuPct != null ? `${fmtNum(cpuPct)}٪` : t('unavailable')} accent="var(--success)" />
        <MetricCard icon="ram" label={t('ram')} value={ramPct != null ? `${fmtNum(ramPct)}٪` : t('unavailable')} accent="var(--accent)" />
        <MetricCard icon="disk" label={t('disk')} value={diskPct != null ? `${fmtNum(diskPct)}٪` : t('unavailable')} accent="var(--warning)" />
      </div>

      <div className="grid grid-2">
        <div className="card">
          <div className="card-title"><Icon name="bot" size={15} />{t('ai_requests')} — 24h</div>
          <Chart data={(series ?? []).map((r) => r.value)} height={150} />
        </div>
        <div className="card">
          <div className="card-title"><Icon name="heart" size={15} />{t('services')}</div>
          {(health?.services ?? []).length
            ? <div className="kv-list">
                {health.services.map((s) => (
                  <div key={s.service} className="kv">
                    <span className="mono">{s.service}</span><StatusBadge value={s.status} />
                  </div>
                ))}
              </div>
            : <div className="empty"><div className="empty-icon"><Icon name="globe" size={24} /></div><div className="muted">{t('no_data')}</div></div>}
          {health && (
            <div className="row mt" style={{ fontSize: 12 }} >
              <span className="muted num">DB: {fmtNum(health.database?.latencyMs)}ms</span>
              <span className="muted num">Redis: {health.redis?.ok ? `${fmtNum(health.redis.latencyMs)}ms` : '—'}</span>
              <span className="spacer" />
              <StatusBadge value={health.status === 'healthy' ? 'healthy' : 'degraded'} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

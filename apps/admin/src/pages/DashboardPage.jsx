import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api.js';
import { fmtNum, t } from '../lib/i18n.js';
import { MetricCard, Chart, StatusBadge, PageHeader } from '../components/ui.jsx';
import { Icon } from '../components/icons.jsx';
import { useStore } from '../state/store.jsx';

const RANGES = [{ value: 30, label: '۳۰ دقیقه' }, { value: 60, label: '۱ ساعت' }, { value: 360, label: '۶ ساعت' }];

const number = (value) => Number.isFinite(Number(value)) ? Number(value) : null;
const percent = (used, total) => {
  const u = number(used), t = number(total);
  return u != null && t > 0 ? (u / t) * 100 : null;
};
const disks = (value) => {
  if (Array.isArray(value)) return value;
  try { return JSON.parse(value ?? '[]'); } catch { return []; }
};
const storagePercent = (row) => {
  const values = disks(row?.disks).map((disk) => number(disk?.pct)).filter((value) => value != null);
  return values.length ? Math.max(...values) : null;
};
const average = (values) => {
  const valid = values.filter((value) => value != null);
  return valid.length ? valid.reduce((sum, value) => sum + value, 0) / valid.length : null;
};

function ResourceChart({ icon, title, data, color, averageValue }) {
  return (
    <div className="card resource-chart-card">
      <div className="row resource-chart-head">
        <div className="card-title"><Icon name={icon} size={15} />{title}</div>
        <span className="resource-average">میانگین: {averageValue == null ? '—' : `${fmtNum(Math.round(averageValue))}%`}</span>
      </div>
      <Chart data={data} height={156} color={color} format={(value) => `${fmtNum(Math.round(value))}%`} />
    </div>
  );
}

export function DashboardPage() {
  const { toast } = useStore();
  const [summary, setSummary] = useState(null);
  const [series, setSeries] = useState(null);
  const [resources, setResources] = useState(null);
  const [history, setHistory] = useState([]);
  const [health, setHealth] = useState(null);
  const [range, setRange] = useState(60);

  const load = useCallback(() => {
    api('/analytics/summary').then(setSummary).catch((e) => toast(e.message, 'error'));
    api('/analytics/timeseries?metric=ai_requests&hours=24').then(setSeries).catch(() => {});
    api('/resources/latest').then(setResources).catch(() => {});
    api('/system/health').then(setHealth).catch(() => {});
    api(`/resources/history?minutes=${range}`).then(setHistory).catch(() => setHistory([]));
  }, [range, toast]);

  useEffect(() => {
    load();
    const timer = setInterval(load, 30_000);
    return () => clearInterval(timer);
  }, [load]);

  const cpuPct = resources?.available ? number(resources.cpu_percent) : null;
  const ramPct = resources?.available ? percent(resources.mem_used, resources.mem_total) : null;
  const swapPct = resources?.available ? percent(resources.swap_used, resources.swap_total) : null;
  const diskPct = resources?.available ? storagePercent(resources) : null;

  const charts = useMemo(() => ({
    cpu: history.map((row) => number(row.cpu_percent)),
    ram: history.map((row) => percent(row.mem_used, row.mem_total)),
    swap: history.map((row) => percent(row.swap_used, row.swap_total)),
    disk: history.map(storagePercent),
  }), [history]);

  return (
    <div className="page">
      <PageHeader icon="dashboard" title={t('dashboard')} subtitle={t('last_24h')}
        actions={<button className="btn sm" onClick={load}><Icon name="refresh" size={13} /> {t('refresh')}</button>} />

      <div className="grid grid-cards dashboard-kpis">
        <MetricCard icon="users" label={t('total_groups')} value={fmtNum(summary?.groups?.total ?? 0)} hint={`${t('active_groups')}: ${fmtNum(summary?.groups?.active_24h ?? 0)}`} />
        <MetricCard icon="user" label={t('total_users')} value={fmtNum(summary?.users?.total ?? 0)} hint={`${t('active_users')}: ${fmtNum(summary?.users?.active_24h ?? 0)}`} />
        <MetricCard icon="bot" label={t('ai_requests')} value={fmtNum(summary?.usage?.requests ?? 0)} accent="var(--info)" />
        <MetricCard icon="zap" label={t('tokens')} value={fmtNum(Number(summary?.usage?.tokens_in ?? 0) + Number(summary?.usage?.tokens_out ?? 0))} />
        <MetricCard icon="dollar" label={t('cost')} value={`$${Number(summary?.usage?.cost ?? 0).toFixed(2)}`} accent="var(--warning)" />
        <MetricCard icon="alert" label={t('errors')} value={fmtNum(summary?.usage?.errors ?? 0)} accent="var(--danger)" />
      </div>

      <section className="resource-overview">
        <div className="resource-overview-head">
          <div><h2><Icon name="activity" size={18} /> پایش منابع سرور</h2><p>داده‌های واقعی سرویس با میانگین بازهٔ انتخاب‌شده</p></div>
          <div className="range-switch" role="group" aria-label="بازه نمودار منابع">
            {RANGES.map((item) => <button key={item.value} className={range === item.value ? 'active' : ''} onClick={() => setRange(item.value)}>{item.label}</button>)}
          </div>
        </div>
        <div className="grid grid-cards resource-current">
          <MetricCard icon="cpu" label="CPU اکنون" value={cpuPct == null ? t('unavailable') : `${fmtNum(Math.round(cpuPct))}%`} hint={`میانگین: ${average(charts.cpu) == null ? '—' : `${fmtNum(Math.round(average(charts.cpu)))}%`}`} accent="var(--success)" />
          <MetricCard icon="ram" label="RAM اکنون" value={ramPct == null ? t('unavailable') : `${fmtNum(Math.round(ramPct))}%`} hint={`میانگین: ${average(charts.ram) == null ? '—' : `${fmtNum(Math.round(average(charts.ram)))}%`}`} accent="var(--accent)" />
          <MetricCard icon="database" label="Swap اکنون" value={swapPct == null ? t('unavailable') : `${fmtNum(Math.round(swapPct))}%`} hint={`میانگین: ${average(charts.swap) == null ? '—' : `${fmtNum(Math.round(average(charts.swap)))}%`}`} accent="var(--warning)" />
          <MetricCard icon="disk" label="Storage اکنون" value={diskPct == null ? t('unavailable') : `${fmtNum(Math.round(diskPct))}%`} hint={`میانگین: ${average(charts.disk) == null ? '—' : `${fmtNum(Math.round(average(charts.disk)))}%`}`} accent="var(--danger)" />
        </div>
        <div className="resource-chart-grid">
          <ResourceChart icon="cpu" title="CPU" data={charts.cpu} color="var(--success)" averageValue={average(charts.cpu)} />
          <ResourceChart icon="ram" title="RAM" data={charts.ram} color="var(--accent)" averageValue={average(charts.ram)} />
          <ResourceChart icon="database" title="Swap" data={charts.swap} color="var(--warning)" averageValue={average(charts.swap)} />
          <ResourceChart icon="disk" title="Storage" data={charts.disk} color="var(--danger)" averageValue={average(charts.disk)} />
        </div>
      </section>

      <div className="grid grid-2">
        <div className="card">
          <div className="card-title"><Icon name="bot" size={15} />{t('ai_requests')} — 24h</div>
          <Chart data={(series ?? []).map((row) => row.value)} height={150} />
        </div>
        <div className="card">
          <div className="card-title"><Icon name="heart" size={15} />{t('services')}</div>
          {(health?.services ?? []).length ? <div className="kv-list">{health.services.map((service) => <div key={service.service} className="kv"><span className="mono">{service.service}</span><StatusBadge value={service.status} /></div>)}</div>
            : <div className="empty"><div className="empty-icon"><Icon name="globe" size={24} /></div><div className="muted">{t('no_data')}</div></div>}
          {health && <div className="row mt" style={{ fontSize: 12 }}><span className="muted num">DB: {fmtNum(health.database?.latencyMs)}ms</span><span className="muted num">Redis: {health.redis?.ok ? `${fmtNum(health.redis.latencyMs)}ms` : '—'}</span><span className="spacer" /><StatusBadge value={health.status === 'healthy' ? 'healthy' : 'degraded'} /></div>}
        </div>
      </div>
    </div>
  );
}

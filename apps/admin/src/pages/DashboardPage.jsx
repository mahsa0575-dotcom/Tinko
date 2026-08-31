import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api.js';
import { fmtNum, t } from '../lib/i18n.js';
import {
  MetricCard, Chart, StatusBadge, PageHeader, SectionCard, KV, EmptyState, Progress,
} from '../components/ui.jsx';
import { Icon } from '../components/icons.jsx';
import { useStore } from '../state/store.jsx';

const RANGES = [
  { value: 30, label: '۳۰ دقیقه' },
  { value: 60, label: '۱ ساعت' },
  { value: 360, label: '۶ ساعت' },
];

const number = (value) => (Number.isFinite(Number(value)) ? Number(value) : null);
const percent = (used, total) => {
  const u = number(used);
  const tot = number(total);
  return u != null && tot > 0 ? (u / tot) * 100 : null;
};
const disks = (value) => {
  if (Array.isArray(value)) return value;
  try { return JSON.parse(value ?? '[]'); } catch { return []; }
};
const storagePercent = (row) => {
  const values = disks(row?.disks).map((d) => number(d?.pct)).filter((v) => v != null);
  return values.length ? Math.max(...values) : null;
};
const average = (values) => {
  const valid = (values ?? []).filter((v) => v != null);
  return valid.length ? valid.reduce((s, v) => s + v, 0) / valid.length : null;
};
const pctLabel = (v) => (v == null ? '—' : `${fmtNum(Math.round(v))}٪`);

function ResourceChart({ icon, title, data, color, averageValue }) {
  return (
    <div className="resource-chart-card">
      <div className="resource-chart-head">
        <span className="title-icon"><Icon name={icon} size={14} /></span>
        <span className="spacer">{title}</span>
        <span className="resource-average">میانگین {pctLabel(averageValue)}</span>
      </div>
      <Chart data={data} height={150} color={color} format={(v) => pctLabel(v)} />
    </div>
  );
}

function ResourceGauge({ icon, label, value, avg, accent }) {
  const has = value != null;
  return (
    <div className="metric" style={{ '--accent': accent }}>
      <div className="metric-head">
        <span className="metric-icon"><Icon name={icon} size={15} /></span>
        <span className="metric-label">{label}</span>
      </div>
      <span className={has ? 'metric-value num' : 'metric-value is-text'}>
        {has ? pctLabel(value) : t('unavailable')}
      </span>
      {has && <Progress pct={value} />}
      <span className="metric-hint">میانگین بازه {pctLabel(avg)}</span>
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

  const tokens = Number(summary?.usage?.tokens_in ?? 0) + Number(summary?.usage?.tokens_out ?? 0);

  return (
    <div className="page">
      <PageHeader
        icon="dashboard"
        title={t('dashboard')}
        subtitle="نمای کلی وضعیت پلتفرم، مصرف هوش مصنوعی و سلامت منابع سرور در ۲۴ ساعت گذشته"
        actions={
          <button className="btn sm" onClick={load}>
            <Icon name="refresh" size={13} />{t('refresh')}
          </button>
        }
      />

      <div className="grid grid-cards dashboard-kpis">
        <MetricCard icon="users" label={t('total_groups')} value={fmtNum(summary?.groups?.total ?? 0)}
          hint={`${fmtNum(summary?.groups?.active_24h ?? 0)} گروه فعال`} />
        <MetricCard icon="user" label={t('total_users')} value={fmtNum(summary?.users?.total ?? 0)}
          hint={`${fmtNum(summary?.users?.active_24h ?? 0)} کاربر فعال`} accent="var(--accent-2)" />
        <MetricCard icon="bot" label={t('ai_requests')} value={fmtNum(summary?.usage?.requests ?? 0)}
          hint={t('last_24h')} accent="var(--info)" />
        <MetricCard icon="zap" label={t('tokens')} value={fmtNum(tokens)}
          hint={`ورودی ${fmtNum(summary?.usage?.tokens_in ?? 0)} · خروجی ${fmtNum(summary?.usage?.tokens_out ?? 0)}`}
          accent="var(--accent)" />
        <MetricCard icon="dollar" label={t('cost')} value={`$${Number(summary?.usage?.cost ?? 0).toFixed(2)}`}
          hint="تخمین بر پایه نرخ مدل‌ها" accent="var(--warning)" />
        <MetricCard icon="alert" label={t('errors')} value={fmtNum(summary?.usage?.errors ?? 0)}
          hint={t('last_24h')} accent="var(--danger)" />
      </div>

      <section className="resource-overview">
        <div className="resource-overview-head">
          <span className="card-head-icon"><Icon name="activity" size={16} /></span>
          <div className="spacer">
            <div className="card-title">پایش منابع سرور</div>
            <div className="card-sub">داده‌های واقعی سرویس، به همراه میانگین بازهٔ انتخاب‌شده</div>
          </div>
          <div className="segmented" role="group" aria-label="بازه نمودار منابع">
            {RANGES.map((item) => (
              <button key={item.value} className={range === item.value ? 'active' : ''}
                onClick={() => setRange(item.value)}>{item.label}</button>
            ))}
          </div>
        </div>

        <div className="resource-current">
          <ResourceGauge icon="cpu" label="پردازنده" value={cpuPct} avg={average(charts.cpu)} accent="var(--success)" />
          <ResourceGauge icon="ram" label="حافظه" value={ramPct} avg={average(charts.ram)} accent="var(--accent)" />
          <ResourceGauge icon="database" label="سواپ" value={swapPct} avg={average(charts.swap)} accent="var(--warning)" />
          <ResourceGauge icon="disk" label="فضای ذخیره" value={diskPct} avg={average(charts.disk)} accent="var(--danger)" />
        </div>

        <div className="resource-chart-grid">
          <ResourceChart icon="cpu" title="پردازنده" data={charts.cpu} color="var(--success)" averageValue={average(charts.cpu)} />
          <ResourceChart icon="ram" title="حافظه" data={charts.ram} color="var(--accent)" averageValue={average(charts.ram)} />
          <ResourceChart icon="database" title="سواپ" data={charts.swap} color="var(--warning)" averageValue={average(charts.swap)} />
          <ResourceChart icon="disk" title="فضای ذخیره" data={charts.disk} color="var(--danger)" averageValue={average(charts.disk)} />
        </div>
      </section>

      <div className="grid grid-2">
        <SectionCard icon="bot" title={t('ai_requests')} subtitle="روند ۲۴ ساعت گذشته">
          <Chart data={(series ?? []).map((row) => row.value)} height={168} />
        </SectionCard>

        <SectionCard
          icon="heart"
          title={t('services')}
          subtitle="وضعیت لحظه‌ای سرویس‌های زیرساخت"
          actions={health && <StatusBadge value={health.status === 'healthy' ? 'healthy' : 'degraded'} />}
          footer={
            health && (
              <>
                <span className="badge info"><Icon name="database" size={11} />پایگاه داده {fmtNum(health.database?.latencyMs)}ms</span>
                <span className={`badge ${health.redis?.ok ? 'success' : 'neutral'}`}>
                  <Icon name="zap" size={11} />Redis {health.redis?.ok ? `${fmtNum(health.redis.latencyMs)}ms` : '—'}
                </span>
              </>
            )
          }
        >
          {(health?.services ?? []).length ? (
            <div className="kv-list">
              {health.services.map((s) => (
                <KV key={s.service} label={<span className="mono">{s.service}</span>}>
                  <StatusBadge value={s.status} />
                </KV>
              ))}
            </div>
          ) : (
            <EmptyState icon="globe" title="سرویسی گزارش نشده" text="هنوز هیچ سرویسی وضعیت خود را ارسال نکرده است." />
          )}
        </SectionCard>
      </div>
    </div>
  );
}

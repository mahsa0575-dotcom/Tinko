import { useEffect, useState } from 'react';
import { api, apiRaw } from '../lib/api.js';
import { fmtNum, t } from '../lib/i18n.js';
import { MetricCard, Chart, PageHeader, SectionCard, Tabs } from '../components/ui.jsx';
import { useStore } from '../state/store.jsx';
import { Icon } from '../components/icons.jsx';

const METRICS = [
  { key: 'ai_requests', label: 'درخواست هوش مصنوعی', icon: 'bot' },
  { key: 'messages', label: 'پیام‌ها', icon: 'message' },
  { key: 'tokens', label: 'توکن‌ها', icon: 'zap' },
  { key: 'cost', label: 'هزینه', icon: 'dollar' },
  { key: 'errors', label: 'خطاها', icon: 'alert' },
  { key: 'moderation', label: 'مدیریت محتوا', icon: 'shield' },
];

const RANGES = [
  { value: 6, label: '۶ ساعت' },
  { value: 24, label: '۲۴ ساعت' },
  { value: 72, label: '۳ روز' },
  { value: 168, label: '۷ روز' },
];

export function AnalyticsPage() {
  const { toast } = useStore();
  const [metric, setMetric] = useState('ai_requests');
  const [hours, setHours] = useState(24);
  const [series, setSeries] = useState(null);
  const [summary, setSummary] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setSeries(null);
    api(`/analytics/timeseries?metric=${metric}&hours=${hours}`)
      .then(setSeries)
      .catch((e) => toast(e.message, 'error'));
  }, [metric, hours, toast]);

  useEffect(() => { api('/analytics/summary').then(setSummary).catch(() => {}); }, []);

  const points = (series ?? []).map((r) => Number(r.value ?? 0));
  const total = points.reduce((s, v) => s + v, 0);
  const peak = points.length ? Math.max(...points) : 0;
  const avg = points.length ? total / points.length : 0;
  const active = METRICS.find((m) => m.key === metric);
  const isCost = metric === 'cost';
  const fmtVal = (v) => (isCost ? `$${Number(v).toFixed(2)}` : fmtNum(Math.round(v)));

  const exportData = async (format) => {
    setBusy(true);
    try {
      const res = await apiRaw(`/analytics/export?format=${format}&hours=${hours}`);
      if (!res.ok) throw new Error(`خروجی گرفتن ناموفق بود (${res.status})`);
      // CSV is text/csv and JSON is application/json — read the raw body, never
      // force res.json() (that would corrupt the CSV into "[object Object]").
      const text = await res.text();
      const blob = new Blob([text], {
        type: format === 'json' ? 'application/json' : 'text/csv;charset=utf-8',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `botai-usage-${new Date().toISOString().slice(0, 10)}.${format}`;
      a.click();
      URL.revokeObjectURL(url);
      toast('فایل خروجی آماده شد', 'success');
    } catch (err) { toast(err.message, 'error'); }
    finally { setBusy(false); }
  };

  return (
    <div className="page">
      <PageHeader
        icon="chart"
        title={t('analytics')}
        subtitle="روند مصرف و سلامت پلتفرم — خروجی شامل همهٔ رکوردهای مصرف است"
        actions={(
          <>
            <button className="btn sm" disabled={busy} onClick={() => exportData('csv')}>
              <Icon name="download" size={13} /> خروجی CSV
            </button>
            <button className="btn sm" disabled={busy} onClick={() => exportData('json')}>
              <Icon name="download" size={13} /> خروجی JSON
            </button>
          </>
        )}
      />

      <div className="grid grid-cards">
        <MetricCard icon="bot" accent="var(--primary)" label={t('ai_requests')}
          value={fmtNum(summary?.usage?.requests ?? 0)} hint="مجموع درخواست‌های موفق" />
        <MetricCard icon="zap" accent="var(--accent)" label={t('tokens')}
          value={fmtNum(Number(summary?.usage?.tokens_in ?? 0) + Number(summary?.usage?.tokens_out ?? 0))}
          hint="ورودی + خروجی" />
        <MetricCard icon="dollar" accent="var(--success)" label={t('cost')}
          value={`$${Number(summary?.usage?.cost ?? 0).toFixed(2)}`} hint="هزینهٔ تجمعی" />
        <MetricCard icon="clock" accent="var(--warning)" label={t('avg_latency')}
          value={fmtNum(summary?.usage?.avg_latency_ms ?? 0)} unit="ms" hint="میانگین زمان پاسخ" />
      </div>

      <SectionCard
        icon={active?.icon ?? 'chart'}
        title={active?.label ?? ''}
        subtitle={`در بازهٔ ${RANGES.find((r) => r.value === hours)?.label} گذشته`}
        actions={(
          <div className="segmented">
            {RANGES.map((r) => (
              <button key={r.value} className={hours === r.value ? 'active' : ''}
                onClick={() => setHours(r.value)}>{r.label}</button>
            ))}
          </div>
        )}
      >
        <Tabs tabs={METRICS} active={metric} onChange={setMetric} />

        <div className="row wrap tight mt">
          <span className="badge primary"><span className="dot" /> مجموع: {fmtVal(total)}</span>
          <span className="badge neutral">بیشینه: {fmtVal(peak)}</span>
          <span className="badge neutral">میانگین: {fmtVal(avg)}</span>
          <div className="spacer" />
          <span className="faint xs">{points.length} نقطهٔ داده</span>
        </div>

        <div className="mt">
          <Chart data={points} height={220} label={active?.label} format={fmtVal} />
        </div>
      </SectionCard>
    </div>
  );
}

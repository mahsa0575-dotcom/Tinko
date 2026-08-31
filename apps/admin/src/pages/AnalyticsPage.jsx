import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { fmtNum, t } from '../lib/i18n.js';
import { MetricCard, Chart } from '../components/ui.jsx';
import { useStore } from '../state/store.jsx';
import { Icon } from '../components/icons.jsx';

const METRICS = [
  { key: 'ai_requests', label: 'درخواست AI' },
  { key: 'messages', label: 'پیام‌ها' },
  { key: 'tokens', label: 'توکن‌ها' },
  { key: 'cost', label: 'هزینه' },
  { key: 'errors', label: 'خطاها' },
  { key: 'moderation', label: 'مدریشن' },
];

export function AnalyticsPage() {
  const { toast } = useStore();
  const [metric, setMetric] = useState('ai_requests');
  const [hours, setHours] = useState(24);
  const [series, setSeries] = useState(null);
  const [summary, setSummary] = useState(null);

  useEffect(() => {
    api(`/analytics/timeseries?metric=${metric}&hours=${hours}`).then(setSeries).catch((e) => toast(e.message, 'error'));
  }, [metric, hours, toast]);
  useEffect(() => { api('/analytics/summary').then(setSummary).catch(() => {}); }, []);

  const total = (series ?? []).reduce((s, r) => s + Number(r.value ?? 0), 0);

  const exportData = async (format) => {
    try {
      const data = await api(`/analytics/export?format=${format}&hours=${hours}`);
      const blob = format === 'json'
        ? new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
        : new Blob([data], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `botai-usage-${new Date().toISOString().slice(0, 10)}.${format}`;
      a.click();
      URL.revokeObjectURL(url);
      toast('فایل خروجی آماده شد', 'success');
    } catch (err) { toast(err.message, 'error'); }
  };

  return (
    <div className="page">
      <div className="row">
        <h1 className="page-title"><span className="title-icon"><Icon name="chart" size={20} /></span>{t('analytics')}</h1>
        <div className="spacer" />
        <button className="btn sm" onClick={() => exportData('csv')}><Icon name="download" size={13} /> CSV</button>
        <button className="btn sm" onClick={() => exportData('json')}><Icon name="download" size={13} /> JSON</button>
      </div>
      <p className="page-subtitle">روند استفاده و سلامت پلتفرم — export شامل تمام رکوردهای usage است (spec §71)</p>

      <div className="row" style={{ marginBottom: 16, flexWrap: 'wrap' }}>
        {METRICS.map((m) => (
          <button key={m.key} className={`btn sm${metric === m.key ? ' primary' : ''}`} onClick={() => setMetric(m.key)}>
            {m.label}
          </button>
        ))}
        <div className="spacer" />
        <select className="select" style={{ width: 130 }} value={hours} onChange={(e) => setHours(Number(e.target.value))}>
          <option value={6}>۶ ساعت</option><option value={24}>۲۴ ساعت</option>
          <option value={72}>۳ روز</option><option value={168}>۷ روز</option>
        </select>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-title">{METRICS.find((m) => m.key === metric)?.label} — {fmtNum(total)} total</div>
        <Chart data={(series ?? []).map((r) => Number(r.value))} height={200} />
      </div>

      <div className="grid grid-cards">
        <MetricCard icon="bot" label={t('ai_requests')} value={fmtNum(summary?.usage?.requests ?? 0)} />
        <MetricCard icon="zap" label={t('tokens')} value={fmtNum(Number(summary?.usage?.tokens_in ?? 0) + Number(summary?.usage?.tokens_out ?? 0))} />
        <MetricCard icon="dollar" label={t('cost')} value={`$${Number(summary?.usage?.cost ?? 0).toFixed(2)}`} />
        <MetricCard icon="clock" label={t('avg_latency')} value={`${fmtNum(summary?.usage?.avg_latency_ms ?? 0)} ms`} />
      </div>
    </div>
  );
}

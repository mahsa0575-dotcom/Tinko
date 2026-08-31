import { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api.js';
import { fmtNum, fmtBytes, fmtTime, t } from '../lib/i18n.js';
import {
  Chart, Progress, PageHeader, SectionCard, Modal, Field, Notice,
  EmptyState, IconButton, LoadingBlock, CodeBlock,
} from '../components/ui.jsx';
import { useStore } from '../state/store.jsx';
import { Icon } from '../components/icons.jsx';

const HEALTH_META = {
  excellent: { kind: 'success', label: 'عالی' },
  healthy: { kind: 'success', label: 'سالم' },
  degraded: { kind: 'info', label: 'افت کیفیت' },
  warning: { kind: 'warning', label: 'هشدار' },
  critical: { kind: 'danger', label: 'بحرانی' },
};

const METRIC_LABEL = {
  cpu: 'پردازنده', ram: 'حافظه', swap: 'سواپ', disk: 'دیسک', load: 'بار سیستم',
};
const LEVEL_LABEL = { warning: 'هشدار', high: 'بالا', critical: 'بحرانی' };

/** Small gauge tile used in the VPS overview grid. */
function GaugeTile({ icon, title, value, unit, pct, hint, accent }) {
  return (
    <div className="card tight vps-gauge-card" style={accent ? { '--accent': accent } : undefined}>
      <div className="card-head">
        <span className="card-head-icon"><Icon name={icon} size={15} /></span>
        <span className="card-title">{title}</span>
      </div>
      <div className="vps-value-row">
        <span className="num">{value}</span>
        {unit && <span className="unit">{unit}</span>}
      </div>
      {pct != null && <Progress pct={pct} />}
      {hint && <span className="faint xs">{hint}</span>}
    </div>
  );
}

/**
 * Real-time VPS monitoring.
 * Data comes from the worker's OS-level collector via /resources/*.
 * Updates every ~2s while the tab is visible; never fabricates values.
 */
export function VpsPage() {
  const { toast } = useStore();
  const [latest, setLatest] = useState(null);
  const [history, setHistory] = useState([]);
  const [paused, setPaused] = useState(false);
  const [lastError, setLastError] = useState(null);
  const [thresholds, setThresholds] = useState(null);
  const [showThresholds, setShowThresholds] = useState(false);
  // Diagnostics returned alongside the "unavailable" answer, so the operator
  // sees WHY there is no data instead of a bare error string.
  const [diag, setDiag] = useState(null);
  const timer = useRef(null);

  const loadThresholds = () => api('/settings/resource-thresholds').then(setThresholds).catch(() => {});
  useEffect(() => { loadThresholds(); }, []);

  const saveThresholds = async () => {
    try {
      await api('/settings/resource-thresholds', { method: 'PUT', body: thresholds });
      toast('آستانه‌های هشدار ذخیره شد', 'success');
      setShowThresholds(false);
    } catch (err) { toast(err.message, 'error'); }
  };

  useEffect(() => {
    let cancelled = false;

    const tick = async () => {
      if (document.hidden || paused || cancelled) return;
      try {
        const data = await api('/resources/latest');
        if (cancelled) return;
        setDiag(data.worker ?? null);
        if (data.available) { setLatest(data); setLastError(null); }
        else { setLatest(null); setLastError(data.reason); }
      } catch (err) { setLastError(err.message); }
    };
    const loadHistory = () => api('/resources/history?minutes=30').then(setHistory).catch(() => {});

    tick(); loadHistory();
    timer.current = setInterval(tick, 2000);
    const histTimer = setInterval(loadHistory, 15_000);
    return () => { cancelled = true; clearInterval(timer.current); clearInterval(histTimer); };
  }, [paused]);

  if (!latest && !lastError) {
    return (
      <div className="page">
        <PageHeader icon="server" title={t('vps')} subtitle="در حال دریافت متریک‌های زنده…" />
        <LoadingBlock rows={6} />
      </div>
    );
  }

  if (!latest) {
    return (
      <div className="page">
        <PageHeader icon="server" title={t('vps')} subtitle="پایش منابع سرور" />
        <SectionCard accent="warning" icon="alert" title="متریک‌ها در دسترس نیست">
          <div className="col">
            <EmptyState icon="server" title={t('unavailable')} text={lastError} />
            {diag && (
              <>
                <Notice kind={diag.alive ? 'info' : 'bad'}
                  title={`سرویس worker: ${diag.alive ? 'در حال اجرا' : 'خارج از دسترس'}`}>
                  {diag.lastSeenAt
                    ? `آخرین ضربان دریافتی: ${fmtTime(diag.lastSeenAt)}`
                    : 'هیچ ضربانی از سرویس جمع‌آورندهٔ متریک دریافت نشده است.'}
                </Notice>
                {!diag.alive && (
                  <CodeBlock title="برای راه‌اندازی سرویس، این دستور را اجرا کنید" copyable compact>
                    docker compose up -d worker
                  </CodeBlock>
                )}
              </>
            )}
            <div className="row">
              <div className="spacer" />
              <button className="btn primary" onClick={() => setPaused((p) => !p)}>
                <Icon name="refresh" size={14} /> {t('refresh')}
              </button>
            </div>
          </div>
        </SectionCard>
      </div>
    );
  }

  // Null-safe: missing measurements render as "unavailable", never zero.
  const memPct = latest.mem_total > 0 ? (latest.mem_used / latest.mem_total) * 100 : null;
  const swapPct = (latest.swap_total ?? 0) > 0 ? ((latest.swap_used ?? 0) / latest.swap_total) * 100 : 0;
  const rx = (latest.net ?? []).reduce((s, n) => s + (n.rx_bps ?? 0), 0);
  const tx = (latest.net ?? []).reduce((s, n) => s + (n.tx_bps ?? 0), 0);
  const rootDisk = (latest.disks ?? []).find((d) => d.mount === '/') ?? (latest.disks ?? [])[0];
  const load1 = latest.load_avg?.[0];
  const loadRatio = load1 && latest.cpu_cores ? load1 / latest.cpu_cores : null;
  // The collector reports the cgroup CPU quota separately, because the stored
  // cpu_cores column is an integer and rounds a fractional limit up.
  const coreLabel = latest.cpuQuota ?? latest.cpu_quota ?? latest.cpu_cores;

  const pick = (arr, key) => (arr ?? []).map((row) => row[key]);
  const health = HEALTH_META[latest.health?.score] ?? null;

  return (
    <div className="page">
      <PageHeader
        icon="server"
        title={t('vps')}
        subtitle={`${latest.source === 'container' ? 'متریک‌های کانتینر' : 'متریک‌های هاست / VPS'}${
          latest.ageMs != null ? ` · ${fmtNum(Math.round(latest.ageMs / 1000))} ثانیه پیش` : ''}`}
        actions={(
          <>
            {health && (
              <span className={`badge ${health.kind}`}>
                <Icon name="heart" size={13} /> سلامت: {health.label}
              </span>
            )}
            <span className="status-pill">
              <span className={`pulse ${latest.stale ? 'warn' : 'ok'}`} />
              {latest.stale ? 'کهنه' : t('live')} · {fmtTime(latest.captured_at)}
            </span>
            <IconButton icon={paused ? 'play' : 'pause'}
              title={paused ? 'ادامهٔ پایش زنده' : 'توقف پایش زنده'}
              active={paused} onClick={() => setPaused((p) => !p)} />
            <IconButton icon="gauge" title="آستانه‌های هشدار" onClick={() => setShowThresholds(true)} />
          </>
        )}
      />

      {latest.stale && (
        <Notice kind="warn" title="داده‌ها لحظه‌ای نیستند">
          آخرین متریک بیش از یک دقیقه قدیمی است
          {latest.worker && !latest.worker.alive && ' — سرویس worker ضربان نمی‌فرستد'}.
          اعداد زیر ممکن است وضعیت فعلی سرور را نشان ندهند.
        </Notice>
      )}

      {/* Overview gauges */}
      <div className="vps-top-cards">
        <GaugeTile icon="cpu" title={t('cpu')} accent="var(--success)"
          value={latest.cpu_percent != null ? `${fmtNum(latest.cpu_percent)}٪` : '—'}
          pct={latest.cpu_percent}
          hint={`${fmtNum(coreLabel)} هسته${
            latest.host_cores && latest.host_cores !== latest.cpu_cores
              ? ` (هاست: ${fmtNum(latest.host_cores)})` : ''}`}
        />
        <GaugeTile icon="ram" title={t('ram')} accent="var(--accent)"
          value={fmtBytes(latest.mem_used)} unit={`از ${fmtBytes(latest.mem_total)}`}
          pct={memPct} hint={memPct != null ? `${fmtNum(memPct)}٪ مصرف` : 'در دسترس نیست'}
        />
        <GaugeTile icon="database" title={t('swap')} accent="var(--warning)"
          value={fmtBytes(latest.swap_used ?? 0)} unit={`از ${fmtBytes(latest.swap_total ?? 0)}`}
          pct={swapPct}
          hint={(latest.swap_total ?? 0) > 0 ? `${fmtNum(swapPct)}٪ مصرف` : 'سواپ تنظیم نشده'}
        />
        <GaugeTile icon="disk" title={t('disk')} accent="var(--danger)"
          value={`${fmtNum(rootDisk?.pct ?? 0)}٪`} pct={rootDisk?.pct}
          hint={rootDisk?.mount ? `مسیر ${rootDisk.mount}` : undefined}
        />
        <GaugeTile icon="globe" title={t('network')} accent="var(--info)"
          value={fmtBytes(rx)} unit="بر ثانیه دریافت"
          hint={`ارسال: ${fmtBytes(tx)} بر ثانیه`}
        />
        <GaugeTile icon="gauge" title={t('load')} accent="var(--accent-2)"
          value={load1 != null ? fmtNum(load1) : '—'} unit={`از ${fmtNum(coreLabel)} هسته`}
          pct={loadRatio != null ? loadRatio * 100 : null}
          hint={loadRatio != null ? `${fmtNum(Math.round(loadRatio * 100))}٪ ظرفیت` : undefined}
        />
      </div>

      {/* History charts */}
      <div className="grid grid-2">
        <SectionCard icon="trendUp" title="پردازنده" subtitle="۳۰ دقیقهٔ گذشته">
          <Chart data={pick(history, 'cpu_percent')} height={130}
            label={t('cpu')} format={(v) => `${fmtNum(Math.round(v))}٪`} />
        </SectionCard>
        <SectionCard icon="trendUp" title={t('ram')} subtitle="۳۰ دقیقهٔ گذشته">
          <Chart data={pick(history, 'mem_used')} height={130} color="var(--info)"
            label={t('ram')} format={fmtBytes} />
        </SectionCard>
      </div>

      <div className="grid grid-2">
        {/* Processes */}
        <SectionCard
          icon="activity" title={t('processes')} subtitle="پرمصرف‌ترین فرایندها"
          actions={<span className="badge neutral">{fmtNum((latest.processes ?? []).length)}</span>}
        >
          {(latest.processes ?? []).length === 0 ? (
            <EmptyState icon="activity" title="فرایندی گزارش نشده است" />
          ) : (
            <div className="table-wrap">
              <table className="table dense">
                <thead>
                  <tr>
                    <th>شناسه</th><th>نام فرایند</th><th>پردازنده</th><th>حافظه</th>
                  </tr>
                </thead>
                <tbody>
                  {(latest.processes ?? []).map((p) => (
                    <tr key={p.pid}>
                      <td className="ltr faint xs">{p.pid}</td>
                      <td className="cell-strong ltr">{p.name}</td>
                      <td>{fmtNum(p.cpu)}٪</td>
                      <td className="muted sm">{fmtBytes(p.memBytes)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </SectionCard>

        {/* Disks */}
        <SectionCard icon="disk" title="فضای ذخیره‌سازی" subtitle="وضعیت پارتیشن‌ها">
          {(latest.disks ?? []).length === 0 ? (
            <EmptyState icon="disk" title="پارتیشنی گزارش نشده است" />
          ) : (
            <div className="col">
              {(latest.disks ?? []).map((d) => (
                <div key={d.mount} className="col tight">
                  <div className="row tight">
                    <span className="cell-strong ltr sm">{d.mount}</span>
                    <div className="spacer" />
                    <span className="muted xs">{fmtBytes(d.used)} / {fmtBytes(d.total)}</span>
                    <span className={`badge ${d.pct >= 90 ? 'danger' : d.pct >= 75 ? 'warning' : 'neutral'}`}>
                      {fmtNum(d.pct)}٪
                    </span>
                  </div>
                  <Progress pct={d.pct} />
                </div>
              ))}
            </div>
          )}
        </SectionCard>
      </div>

      {/* Thresholds editor */}
      {showThresholds && thresholds && (
        <Modal
          title="آستانه‌های هشدار منابع"
          icon="gauge"
          onClose={() => setShowThresholds(false)}
          footer={(
            <>
              <div className="spacer" />
              <button className="btn" onClick={() => setShowThresholds(false)}>{t('cancel')}</button>
              <button className="btn primary" onClick={saveThresholds}>{t('save')}</button>
            </>
          )}
        >
          <div className="col">
            <Notice kind="info" title="واحد مقادیر">
              برای پردازنده، حافظه، سواپ و دیسک عدد به درصد است؛ برای بار سیستم نسبت به تعداد
              هسته است (مثلاً ۱٫۵ یعنی ۱۵۰٪ ظرفیت).
            </Notice>

            {['cpu', 'ram', 'swap', 'disk', 'load'].map((metric) => (
              <SectionCard key={metric} flat icon="gauge" title={METRIC_LABEL[metric]}>
                <div className="grid grid-3">
                  {['warning', 'high', 'critical'].map((level) => (
                    <Field key={level} label={LEVEL_LABEL[level]}>
                      <input className="input" type="number" step="0.1"
                        value={thresholds[metric]?.[level] ?? ''}
                        onChange={(e) => setThresholds({
                          ...thresholds,
                          [metric]: { ...thresholds[metric], [level]: Number(e.target.value) },
                        })} />
                    </Field>
                  ))}
                </div>
              </SectionCard>
            ))}
          </div>
        </Modal>
      )}
    </div>
  );
}

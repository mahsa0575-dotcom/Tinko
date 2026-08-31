import { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api.js';
import { fmtNum, fmtBytes, fmtTime, t } from '../lib/i18n.js';
import { MetricCard, Chart, StatusBadge, Progress } from '../components/ui.jsx';
import { useStore } from '../state/store.jsx';
import { Icon } from '../components/icons.jsx';

/**
 * Real-time VPS monitoring (spec §79–95).
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
      toast('آستانه‌ها ذخیره شد', 'success');
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
    return <div className="page"><div className="skeleton" style={{ height: 300 }} /></div>;
  }
  if (!latest) {
    return (
      <div className="page">
        <h1 className="page-title"><span className="title-icon"><Icon name="server" size={20} /></span>{t('vps')}</h1>
        <div className="card"><div className="empty">
          <div className="empty-icon"><Icon name="globe" size={24} /></div>
          <div className="empty-title">{t('unavailable')}</div>
          <div className="muted" style={{ maxWidth: 520, margin: '0 auto' }}>{lastError}</div>
          {diag && (
            <div className="notice info mt" style={{ textAlign: 'start', maxWidth: 520, margin: '16px auto 0' }}>
              <Icon name="info" size={15} />
              <div>
                <div>سرویس worker: <strong>{diag.alive ? 'در حال اجرا' : 'خارج از دسترس'}</strong></div>
                {diag.lastSeenAt && <div className="faint" style={{ fontSize: 12 }}>آخرین heartbeat: {fmtTime(diag.lastSeenAt)}</div>}
                {!diag.alive && (
                  <div className="faint mono" dir="ltr" style={{ fontSize: 11.5, marginTop: 6 }}>docker compose up -d worker</div>
                )}
              </div>
            </div>
          )}
          <button className="btn primary mt" onClick={() => setPaused((p) => !p)}><Icon name="refresh" size={14} /> {t('refresh')}</button>
        </div></div>
      </div>
    );
  }

  // Null-safe: missing measurements render as "unavailable", never zero (spec §186).
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

  return (
    <div className="page">
      <div className="row" style={{ marginBottom: 4 }}>
        <h1 className="page-title"><span className="title-icon"><Icon name="server" size={20} /></span>{t('vps')}</h1>
        <div className="spacer" />
        {latest.health && (
          <span className={`badge ${latest.health.score === 'excellent' || latest.health.score === 'healthy' ? 'success'
            : latest.health.score === 'degraded' ? 'info' : latest.health.score === 'warning' ? 'warning' : 'danger'}`}>
            <Icon name="heart" size={14} style={{ color: 'var(--success)' }} /> Health: {latest.health.score}
          </span>
        )}
        <button className="btn sm ghost" onClick={() => setShowThresholds(true)} title="آستانه‌های هشدار"><Icon name="settings" size={13} /></button>
        <span className="status-pill">
          <span className={`pulse ${latest.stale ? 'warn' : 'ok'}`} />
          {latest.stale ? 'کهنه' : t('live')} · {fmtTime(latest.captured_at)}
        </span>
        <button className="btn sm ghost" onClick={() => setPaused((p) => !p)}
          title={paused ? t('refresh') : t('live')}>
          <Icon name={paused ? 'play' : 'pause'} size={13} />
        </button>
      </div>
      <p className="page-subtitle">
        {latest.source === 'container' ? 'متریک‌های کانتینر' : 'متریک‌های هاست / VPS'}
        {latest.ageMs != null && ` · ${Math.round(latest.ageMs / 1000)} ثانیه پیش`}
      </p>

      {latest.stale && (
        <div className="notice warn" style={{ marginBottom: 16 }}>
          <Icon name="alert" size={15} />
          <div>
            آخرین متریک بیش از یک دقیقه قدیمی است
            {latest.worker && !latest.worker.alive && ' — سرویس worker heartbeat نمی‌فرستد'}.
            اعداد زیر لحظه‌ای نیستند.
          </div>
        </div>
      )}

      {/* Thresholds editor (spec §95) */}
      {showThresholds && thresholds && (
        <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && setShowThresholds(false)}>
          <div className="modal" role="dialog" aria-modal="true">
            <div className="modal-head">
              <h3><Icon name="gauge" size={16} /> آستانه‌های هشدار منابع</h3>
              <button className="btn sm ghost" onClick={() => setShowThresholds(false)}><Icon name="x" size={13} /></button>
            </div>
            <p className="muted" style={{ fontSize: 12 }}>درصد برای CPU/RAM/SWAP/دیسک؛ نسبت به تعداد هسته برای LOAD (مثلاً 1.5 = 150٪ ظرفیت).</p>
            {['cpu', 'ram', 'swap', 'disk', 'load'].map((metric) => (
              <div key={metric} className="row" style={{ marginBottom: 8 }}>
                <span className="mono" style={{ width: 60, textTransform: 'uppercase' }}>{metric}</span>
                {['warning', 'high', 'critical'].map((level) => (
                  <label key={level} className="row" style={{ fontSize: 11 }}>
                    {level}
                    <input className="input" type="number" step="0.1" style={{ width: 76 }}
                      value={thresholds[metric]?.[level] ?? ''}
                      onChange={(e) => setThresholds({
                        ...thresholds,
                        [metric]: { ...thresholds[metric], [level]: Number(e.target.value) },
                      })} />
                  </label>
                ))}
              </div>
            ))}
            <div className="row" style={{ justifyContent: 'flex-end' }}>
              <button className="btn" onClick={() => setShowThresholds(false)}>{t('cancel')}</button>
              <button className="btn primary" onClick={saveThresholds}>{t('save')}</button>
            </div>
          </div>
        </div>
      )}

      {/* Top cards */}
      <div className="vps-top-cards">
        <div className="card" style={{ padding: 14 }}>
          <div className="card-title"><Icon name="cpu" size={14} /> {t('cpu')}</div>
          <div className="vps-value-row">
            <span className="big">{latest.cpu_percent != null ? `${fmtNum(latest.cpu_percent)}٪` : '—'}</span>
          </div>
          <Progress pct={latest.cpu_percent} />
          <div className="muted" style={{ fontSize: 11 }}>
            {fmtNum(coreLabel)} هسته
            {latest.host_cores && latest.host_cores !== latest.cpu_cores && ` (هاست: ${fmtNum(latest.host_cores)})`}
          </div>
        </div>
        <div className="card" style={{ padding: 14 }}>
          <div className="card-title"><Icon name="ram" size={14} /> {t('ram')}</div>
          <div className="vps-value-row">
            <span className="big">{fmtBytes(latest.mem_used)}</span><span className="unit">/ {fmtBytes(latest.mem_total)}</span>
          </div>
          <Progress pct={memPct} />
          <div className="muted" style={{ fontSize: 11 }}>{memPct != null ? `${fmtNum(memPct)}٪` : 'در دسترس نیست'}</div>
        </div>
        <div className="card" style={{ padding: 14 }}>
          <div className="card-title"><Icon name="database" size={14} /> {t('swap')}</div>
          <div className="vps-value-row">
            <span className="big">{fmtBytes(latest.swap_used ?? 0)}</span><span className="unit">/ {fmtBytes(latest.swap_total ?? 0)}</span>
          </div>
          <Progress pct={swapPct} />
        </div>
        <div className="card" style={{ padding: 14 }}>
          <div className="card-title"><Icon name="disk" size={14} /> {t('disk')}</div>
          <div className="vps-value-row">
            <span className="big">{fmtNum(rootDisk?.pct ?? 0)}٪</span>
          </div>
          <Progress pct={rootDisk?.pct} />
          <div className="muted" style={{ fontSize: 11 }}>{rootDisk?.mount}</div>
        </div>
        <div className="card" style={{ padding: 14 }}>
          <div className="card-title"><Icon name="globe" size={14} /> {t('network')}</div>
          <div className="vps-value-row"><span className="big">{fmtBytes(rx)}</span><span className="unit">/s ↓</span></div>
          <div className="vps-value-row"><span className="big">{fmtBytes(tx)}</span><span className="unit">/s ↑</span></div>
        </div>
        <div className="card" style={{ padding: 14 }}>
          <div className="card-title"><Icon name="gauge" size={14} /> {t('load')}</div>
          <div className="vps-value-row">
            <span className="big">{load1 != null ? fmtNum(load1) : '—'}</span>
            <span className="unit">/ {fmtNum(coreLabel)} هسته</span>
          </div>
          {loadRatio != null && <Progress pct={loadRatio * 100} />}
        </div>
      </div>

      {/* History charts */}
      <div className="grid grid-2">
        <div className="card"><div className="card-title"><Icon name="trendUp" size={14} /> CPU — 30min</div>
          <Chart data={pick(history, 'cpu_percent')} height={110} /></div>
        <div className="card"><div className="card-title"><Icon name="trendUp" size={14} /> {t('ram')} — 30min</div>
          <Chart data={pick(history, 'mem_used')} height={110} color="var(--info)" /></div>
      </div>

      <div className="grid grid-2 mt">
        {/* Processes */}
        <div className="card">
          <div className="card-title"><Icon name="settings" size={14} /> {t('processes')}</div>
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>PID</th><th>Name</th><th>CPU٪</th><th>RAM</th></tr></thead>
              <tbody>
                {(latest.processes ?? []).map((p) => (
                  <tr key={p.pid}>
                    <td className="mono">{p.pid}</td>
                    <td className="mono">{p.name}</td>
                    <td>{fmtNum(p.cpu)}</td>
                    <td>{fmtBytes(p.memBytes)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        {/* Disks */}
        <div className="card">
          <div className="card-title"><Icon name="disk" size={14} /> Filesystems</div>
          {(latest.disks ?? []).map((d) => (
            <div key={d.mount} className="mt" style={{ marginTop: 10 }}>
              <div className="row" style={{ justifyContent: 'space-between', fontSize: 12 }}>
                <span className="mono">{d.mount}</span>
                <span className="muted">{fmtBytes(d.used)} / {fmtBytes(d.total)}</span>
              </div>
              <Progress pct={d.pct} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

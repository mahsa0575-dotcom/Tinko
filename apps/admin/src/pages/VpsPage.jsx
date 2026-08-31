import { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api.js';
import { fmtNum, fmtBytes, fmtTime, t } from '../lib/i18n.js';
import { MetricCard, Chart, StatusBadge, Progress } from '../components/ui.jsx';
import { useStore } from '../state/store.jsx';

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
        if (data.available) { setLatest(data); setLastError(null); }
        else setLastError(data.reason);
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
        <h1 className="page-title">🖥️ {t('vps')}</h1>
        <div className="card"><div className="empty">
          <div className="empty-icon">📡</div>
          <div className="empty-title">{t('unavailable')}</div>
          <div className="muted">{lastError}</div>
          <button className="btn primary mt" onClick={() => setPaused((p) => !p)}>🔄 {t('refresh')}</button>
        </div></div>
      </div>
    );
  }

  const memPct = (latest.mem_used / latest.mem_total) * 100;
  const swapPct = latest.swap_total > 0 ? (latest.swap_used / latest.swap_total) * 100 : 0;
  const rx = (latest.net ?? []).reduce((s, n) => s + (n.rx_bps ?? 0), 0);
  const tx = (latest.net ?? []).reduce((s, n) => s + (n.tx_bps ?? 0), 0);
  const rootDisk = (latest.disks ?? []).find((d) => d.mount === '/') ?? (latest.disks ?? [])[0];
  const load1 = latest.load_avg?.[0];
  const loadRatio = load1 && latest.cpu_cores ? load1 / latest.cpu_cores : null;

  const pick = (arr, key) => (arr ?? []).map((row) => row[key]);

  return (
    <div className="page">
      <div className="row" style={{ marginBottom: 4 }}>
        <h1 className="page-title">🖥️ {t('vps')}</h1>
        <div className="spacer" />
        {latest.health && (
          <span className={`badge ${latest.health.score === 'excellent' || latest.health.score === 'healthy' ? 'success'
            : latest.health.score === 'degraded' ? 'info' : latest.health.score === 'warning' ? 'warning' : 'danger'}`}>
            ❤️ Health: {latest.health.score}
          </span>
        )}
        <button className="btn sm ghost" onClick={() => setShowThresholds(true)} title="آستانه‌های هشدار">🎚</button>
        <span className="status-pill">
          <span className="pulse ok" /> {t('live')} · {fmtTime(latest.captured_at)}
        </span>
        <button className="btn sm ghost" onClick={() => setPaused((p) => !p)}>{paused ? '▶️' : '⏸'}</button>
      </div>
      <p className="page-subtitle">
        {latest.source === 'container' ? 'Container metrics' : 'Host/VPS metrics'} · {t('live')}
      </p>

      {/* Thresholds editor (spec §95) */}
      {showThresholds && thresholds && (
        <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && setShowThresholds(false)}>
          <div className="modal" role="dialog" aria-modal="true">
            <div className="modal-head">
              <h3>🎚 آستانه‌های هشدار منابع</h3>
              <button className="btn sm ghost" onClick={() => setShowThresholds(false)}>✕</button>
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
          <div className="card-title">🧮 {t('cpu')}</div>
          <div className="vps-value-row"><span className="big">{fmtNum(latest.cpu_percent)}٪</span></div>
          <Progress pct={latest.cpu_percent} />
          <div className="muted" style={{ fontSize: 11 }}>{fmtNum(latest.cpu_cores)} cores</div>
        </div>
        <div className="card" style={{ padding: 14 }}>
          <div className="card-title">🧠 {t('ram')}</div>
          <div className="vps-value-row">
            <span className="big">{fmtBytes(latest.mem_used)}</span><span className="unit">/ {fmtBytes(latest.mem_total)}</span>
          </div>
          <Progress pct={memPct} />
          <div className="muted" style={{ fontSize: 11 }}>{fmtNum(memPct)}٪</div>
        </div>
        <div className="card" style={{ padding: 14 }}>
          <div className="card-title">📦 {t('swap')}</div>
          <div className="vps-value-row">
            <span className="big">{fmtBytes(latest.swap_used ?? 0)}</span><span className="unit">/ {fmtBytes(latest.swap_total ?? 0)}</span>
          </div>
          <Progress pct={swapPct} />
        </div>
        <div className="card" style={{ padding: 14 }}>
          <div className="card-title">💾 {t('disk')}</div>
          <div className="vps-value-row">
            <span className="big">{fmtNum(rootDisk?.pct ?? 0)}٪</span>
          </div>
          <Progress pct={rootDisk?.pct} />
          <div className="muted" style={{ fontSize: 11 }}>{rootDisk?.mount}</div>
        </div>
        <div className="card" style={{ padding: 14 }}>
          <div className="card-title">🌐 {t('network')}</div>
          <div className="vps-value-row"><span className="big">{fmtBytes(rx)}</span><span className="unit">/s ↓</span></div>
          <div className="vps-value-row"><span className="big">{fmtBytes(tx)}</span><span className="unit">/s ↑</span></div>
        </div>
        <div className="card" style={{ padding: 14 }}>
          <div className="card-title">⚖️ {t('load')}</div>
          <div className="vps-value-row">
            <span className="big">{load1 != null ? fmtNum(load1) : '—'}</span>
            <span className="unit">/ {fmtNum(latest.cpu_cores)} cores</span>
          </div>
          {loadRatio != null && <Progress pct={loadRatio * 100} />}
        </div>
      </div>

      {/* History charts */}
      <div className="grid grid-2">
        <div className="card"><div className="card-title">📈 CPU — 30min</div>
          <Chart data={pick(history, 'cpu_percent')} height={110} /></div>
        <div className="card"><div className="card-title">📈 {t('ram')} — 30min</div>
          <Chart data={pick(history, 'mem_used')} height={110} color="var(--info)" /></div>
      </div>

      <div className="grid grid-2 mt">
        {/* Processes */}
        <div className="card">
          <div className="card-title">⚙️ {t('processes')}</div>
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
          <div className="card-title">💾 Filesystems</div>
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

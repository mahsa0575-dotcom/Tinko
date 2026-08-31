import { useId, useMemo, useRef, useState } from 'react';
import { fmtNum } from '../lib/i18n.js';
import { Icon } from './icons.jsx';

/** Page header with icon tile + subtitle. */
export function PageHeader({ icon, title, subtitle, actions }) {
  return (
    <div className="row" style={{ gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
      <div style={{ flex: 1, minWidth: 220 }}>
        <h1 className="page-title">
          {icon && <span className="title-icon"><Icon name={icon} size={20} /></span>}
          {title}
        </h1>
        {subtitle && <p className="page-subtitle" style={{ marginInlineStart: 52 }}>{subtitle}</p>}
        {!subtitle && <div style={{ height: 22 }} />}
      </div>
      {actions && <div className="row">{actions}</div>}
    </div>
  );
}

/** Sortable/searchable data table with pagination. */
export function DataTable({ columns, rows, pageSize = 15, emptyText, loading }) {
  const [sort, setSort] = useState(null);
  const [page, setPage] = useState(0);

  const sorted = useMemo(() => {
    if (!sort) return rows ?? [];
    const col = columns[sort.index];
    const factor = sort.dir === 'asc' ? 1 : -1;
    return [...rows].sort((a, b) => {
      const va = a[col.key], vb = b[col.key];
      return (typeof va === 'number' && typeof vb === 'number')
        ? (va - vb) * factor
        : String(va ?? '').localeCompare(String(vb ?? '')) * factor;
    });
  }, [rows, sort, columns]);

  const pageRows = sorted.slice(page * pageSize, (page + 1) * pageSize);
  const pages = Math.max(1, Math.ceil(sorted.length / pageSize));

  if (loading) {
    return <div className="card">{Array.from({ length: 5 }).map((_, i) => <div key={i} className="skeleton" style={{ marginBottom: 12, width: `${90 - i * 12}%` }} />)}</div>;
  }
  if (!rows?.length) {
    return (
      <div className="card"><div className="empty">
        <div className="empty-icon"><Icon name="database" size={26} /></div>
        <div className="empty-title">{emptyText ?? '—'}</div>
      </div></div>
    );
  }

  return (
    <div>
      <div className="table-wrap">
        <table className="table">
          <thead><tr>
            {columns.map((c, i) => (
              <th key={c.key} onClick={() => c.sortable !== false && setSort((s) =>
                s?.index === i ? { index: i, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { index: i, dir: 'asc' })}>
                {c.label}{sort?.index === i ? (sort.dir === 'asc' ? ' ↑' : ' ↓') : ''}
              </th>
            ))}
          </tr></thead>
          <tbody>
            {pageRows.map((row, ri) => (
              <tr key={row.id ?? ri}>
                {columns.map((c) => <td key={c.key}>{c.render ? c.render(row) : String(row[c.key] ?? '—')}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {pages > 1 && (
        <div className="row" style={{ justifyContent: 'center', marginTop: 12 }}>
          <button className="btn sm ghost" disabled={page === 0} onClick={() => setPage(page - 1)}>‹</button>
          <span className="muted num">{fmtNum(page + 1)} / {fmtNum(pages)}</span>
          <button className="btn sm ghost" disabled={page >= pages - 1} onClick={() => setPage(page + 1)}>›</button>
        </div>
      )}
    </div>
  );
}

/** Metric card: gradient icon tile, accent glow, hover lift. */
export function MetricCard({ label, value, hint, accent, icon }) {
  return (
    <div className="metric" style={accent ? { '--accent': accent } : undefined}>
      <div className="metric-head">
        {icon && <span className="metric-icon"><Icon name={icon} size={16} /></span>}
        <span className="metric-label">{label}</span>
      </div>
      <span className="metric-value num">{value}</span>
      {hint && <span className="metric-hint">{hint}</span>}
    </div>
  );
}

/** Smooth SVG area chart with gradient fill, grid lines and hover tooltip. */
export function Chart({ data, height = 140, color = 'var(--primary)', label, format = fmtNum }) {
  const gradId = useId();
  const wrapRef = useRef(null);
  const [hover, setHover] = useState(null); // { index, xPct }

  const points = (data ?? []).filter((v) => v != null);
  if (points.length < 2) {
    return <div className="muted" style={{ height, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12 }}>{label ? `${label}: ` : ''}—</div>;
  }
  const max = Math.max(...points, 1e-9);
  const min = Math.min(...points, 0);
  const range = max - min || 1;
  const w = 100, h = 100;
  const coords = points.map((v, i) => [
    (i / (points.length - 1)) * w,
    h - ((v - min) / range) * (h - 8) - 4,
  ]);
  // Catmull-Rom → cubic bezier for a smooth, organic curve
  const smooth = (pts) => {
    let d = `M${pts[0][0].toFixed(2)},${pts[0][1].toFixed(2)}`;
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
      const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
      const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
      d += ` C${c1[0].toFixed(2)},${c1[1].toFixed(2)} ${c2[0].toFixed(2)},${c2[1].toFixed(2)} ${p2[0].toFixed(2)},${p2[1].toFixed(2)}`;
    }
    return d;
  };
  const line = smooth(coords);
  const area = `${line} L${w},${h} L0,${h} Z`;

  const onMove = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const xPct = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    const index = Math.round(xPct * (points.length - 1));
    setHover({ index, xPct: xPct * 100 });
  };

  const hoverVal = hover ? points[hover.index] : null;
  const hoverY = hover ? coords[hover.index][1] : 0; // 0..100 viewBox units

  return (
    <div ref={wrapRef} style={{ position: 'relative' }} onMouseLeave={() => setHover(null)}>
      <svg
        viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none"
        style={{ width: '100%', height, display: 'block', cursor: 'crosshair' }}
        onMouseMove={onMove} role="img" aria-label={label}
      >
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.28" />
            <stop offset="100%" stopColor={color} stopOpacity="0.02" />
          </linearGradient>
        </defs>
        {[25, 50, 75].map((y) => (
          <line key={y} x1="0" x2={w} y1={y} y2={y} stroke="var(--border)" strokeWidth="0.5" vectorEffect="non-scaling-stroke" opacity="0.6" />
        ))}
        <path d={area} fill={`url(#${gradId})`} />
        <path d={line} fill="none" stroke={color} strokeWidth="2.2" vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />
        {hover && (
          <g>
            <line x1={hover.xPct / 100 * w} x2={hover.xPct / 100 * w} y1="0" y2={h} stroke={color} strokeWidth="1" strokeDasharray="3 3" vectorEffect="non-scaling-stroke" opacity="0.5" />
            <circle cx={coords[hover.index][0]} cy={coords[hover.index][1]} r="3" fill={color} stroke="var(--surface)" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
          </g>
        )}
      </svg>
      {hover && (
        <div
          style={{
            position: 'absolute', top: `calc(${hoverY / 100 * 100}% - ${height * hoverY / 100 + 30}px)`, left: `${hover.xPct}%`,
            transform: `translateX(${hover.xPct > 80 ? '-105%' : hover.xPct < 20 ? '5%' : '-50%'})`,
            background: 'var(--surface)', border: '1px solid var(--border-strong)', borderRadius: 9,
            padding: '4px 10px', fontSize: 11.5, fontWeight: 700, pointerEvents: 'none',
            boxShadow: 'var(--shadow-2)', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums',
          }}
        >
          {format(hoverVal)}
        </div>
      )}
    </div>
  );
}

export function Modal({ title, onClose, children, wide }) {
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}>
      <div className={`modal${wide ? ' wide' : ''}`} role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-head">
          <h3>{title}</h3>
          <button className="btn sm ghost icon" onClick={onClose} aria-label="close"><Icon name="x" size={15} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function ConfirmDialog({ title, message, onConfirm, onClose }) {
  return (
    <Modal title={title} onClose={onClose}>
      <p className="muted" style={{ lineHeight: 1.8 }}>{message}</p>
      <div className="row" style={{ justifyContent: 'flex-end', marginTop: 18 }}>
        <button className="btn" onClick={onClose}>انصراف</button>
        <button className="btn danger" onClick={() => { onConfirm(); onClose(); }}>
          <Icon name="trash" size={14} />تأیید و حذف
        </button>
      </div>
    </Modal>
  );
}

const STATUS_MAP = {
  active: ['success', 'فعال'], healthy: ['success', 'سالم'], online: ['success', 'آنلاین'],
  success: ['success', 'موفق'], done: ['success', 'انجام شد'], resolved: ['success', 'حل شد'],
  degraded: ['warning', 'افت کیفیت'], warning: ['warning', 'هشدار'], pending: ['warning', 'در انتظار'],
  new: ['info', 'جدید'], acknowledged: ['info', 'بررسی شد'],
  down: ['danger', 'قطع'], offline: ['danger', 'آفلاین'], failed: ['danger', 'ناموفق'], error: ['danger', 'خطا'],
  disabled: ['neutral', 'غیرفعال'], expired: ['neutral', 'منقضی'], unknown: ['neutral', 'نامشخص'],
  orphaned: ['neutral', 'غیرفعال'], blocked: ['danger', 'مسدود'], shadow_ignored: ['warning', 'شادو'],
};

export function StatusBadge({ value }) {
  const [kind, label] = STATUS_MAP[value] ?? ['neutral', value ?? '—'];
  return <span className={`badge ${kind}`}><span className="dot" />{label}</span>;
}

export function Progress({ pct }) {
  const p = Math.min(100, Math.max(0, pct ?? 0));
  const kind = p >= 90 ? 'bad' : p >= 75 ? 'warn' : 'ok';
  return <div className="progress"><div className={`bar ${kind}`} style={{ width: `${p}%` }} /></div>;
}

export function Spinner({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" style={{ animation: 'spin 1s linear infinite' }} aria-label="loading">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity=".25" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

import { useMemo, useState } from 'react';
import { fmtNum } from '../lib/i18n.js';

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
        <div className="empty-icon">📭</div>
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
          <span className="muted">{fmtNum(page + 1)} / {fmtNum(pages)}</span>
          <button className="btn sm ghost" disabled={page >= pages - 1} onClick={() => setPage(page + 1)}>›</button>
        </div>
      )}
    </div>
  );
}

/** Metric card with optional accent + hint. */
export function MetricCard({ label, value, hint, accent, icon }) {
  return (
    <div className="metric" style={accent ? { '--accent': accent } : undefined}>
      <span className="metric-label">{icon ? `${icon} ` : ''}{label}</span>
      <span className="metric-value">{value}</span>
      {hint && <span className="metric-hint">{hint}</span>}
    </div>
  );
}

/** Lightweight inline SVG line/area chart — no chart library needed. */
export function Chart({ data, height = 120, color = 'var(--primary)', label }) {
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
  const line = coords.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(2)},${y.toFixed(2)}`).join(' ');
  const area = `${line} L${w},${h} L0,${h} Z`;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" style={{ width: '100%', height, display: 'block' }} role="img" aria-label={label}>
      <path d={area} fill={color} opacity="0.12" />
      <path d={line} fill="none" stroke={color} strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
    </svg>
  );
}

export function Modal({ title, onClose, children, wide }) {
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}>
      <div className={`modal${wide ? ' wide' : ''}`} role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-head">
          <h3>{title}</h3>
          <button className="btn sm ghost" onClick={onClose} aria-label="close">✕</button>
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
        <button className="btn danger" onClick={() => { onConfirm(); onClose(); }}>تأیید و حذف</button>
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

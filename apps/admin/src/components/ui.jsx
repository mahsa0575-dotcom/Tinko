import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { fmtNum, t } from '../lib/i18n.js';
import { Icon } from './icons.jsx';

/* ==========================================================================
   PAGE HEADER
   ========================================================================== */
export function PageHeader({ icon, title, subtitle, actions }) {
  return (
    <header className="page-head">
      {icon && (
        <div className="page-head-icon" aria-hidden="true">
          <Icon name={icon} size={22} />
        </div>
      )}
      <div className="page-head-text">
        <h1 className="page-title">{title}</h1>
        {subtitle && <p className="page-subtitle">{subtitle}</p>}
      </div>
      {actions && <div className="page-actions">{actions}</div>}
    </header>
  );
}

/* ==========================================================================
   SECTION CARD — a titled card with optional icon / actions / footer
   ========================================================================== */
export function SectionCard({
  title, subtitle, icon, actions, children, footer, accent, className = '', bodyClass = '', flat,
}) {
  return (
    <section className={`card${accent ? ` accent-${accent}` : ''}${flat ? ' tight' : ''} ${className}`}>
      {(title || actions) && (
        <div className="card-head">
          {icon && <span className="card-head-icon"><Icon name={icon} size={16} /></span>}
          <div className="spacer">
            {title && <div className="card-title">{title}</div>}
            {subtitle && <div className="card-sub">{subtitle}</div>}
          </div>
          {actions && <div className="row tight">{actions}</div>}
        </div>
      )}
      <div className={`card-body ${bodyClass}`}>{children}</div>
      {footer && <div className="card-foot">{footer}</div>}
    </section>
  );
}

/* ==========================================================================
   TOOLBAR
   ========================================================================== */
export function Toolbar({ children }) {
  return <div className="toolbar">{children}</div>;
}

export function SearchInput({ value, onChange, placeholder, onEnter }) {
  return (
    <div className="input-icon">
      <Icon name="search" size={15} />
      <input
        className="input"
        value={value}
        placeholder={placeholder ?? t('search')}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && onEnter?.()}
      />
    </div>
  );
}

/* ==========================================================================
   FIELD WRAPPER
   ========================================================================== */
export function Field({ label, hint, error, required, children, htmlFor }) {
  return (
    <div className="field">
      {label && (
        <label className="field-label" htmlFor={htmlFor}>
          {label}
          {required && <span className="req">*</span>}
        </label>
      )}
      {children}
      {hint && !error && <span className="field-hint">{hint}</span>}
      {error && <span className="field-error">{error}</span>}
    </div>
  );
}

/* ==========================================================================
   TOGGLE / CHECKBOX / SLIDER
   ========================================================================== */
export function Toggle({ checked, onChange, label, hint, disabled }) {
  return (
    <label className="toggle">
      <input type="checkbox" checked={!!checked} disabled={disabled}
        onChange={(e) => onChange?.(e.target.checked)} />
      {(label || hint) && (
        <span className="toggle-text">
          {label && <span className="strong sm">{label}</span>}
          {hint && <span className="field-hint">{hint}</span>}
        </span>
      )}
    </label>
  );
}

export function Checkbox({ checked, indeterminate, onChange, label, disabled, title }) {
  const ref = useRef(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = !!indeterminate;
  }, [indeterminate]);
  return (
    <label className="checkbox" title={title}>
      <input ref={ref} type="checkbox" checked={!!checked} disabled={disabled}
        onChange={(e) => onChange?.(e.target.checked)} />
      {label && <span>{label}</span>}
    </label>
  );
}

export function Slider({ label, value, min = 0, max = 100, step = 1, onChange, format }) {
  const v = Number(value ?? min);
  const pct = ((v - min) / (max - min || 1)) * 100;
  return (
    <div className="slider">
      <div className="slider-head">
        <span>{label}</span>
        <span className="slider-value">{format ? format(v) : v}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={v}
        style={{ '--pct': pct }}
        onChange={(e) => onChange?.(Number(e.target.value))} />
    </div>
  );
}

/* ==========================================================================
   TABS
   ========================================================================== */
export function Tabs({ tabs, active, onChange }) {
  const norm = tabs.map((tab) => (typeof tab === 'string' ? { key: tab, label: tab } : tab));
  return (
    <div className="tabs" role="tablist">
      {norm.map((tab) => (
        <button key={tab.key} role="tab" aria-selected={active === tab.key}
          className={`tab${active === tab.key ? ' active' : ''}`}
          onClick={() => onChange(tab.key)}>
          {tab.icon && <Icon name={tab.icon} size={15} />}
          {tab.label}
          {tab.count != null && <span className="tab-count">{fmtNum(tab.count)}</span>}
        </button>
      ))}
    </div>
  );
}

/* ==========================================================================
   ICON BUTTON
   ========================================================================== */
export function IconButton({ icon, title, onClick, danger, active, disabled, size = 15, small, className = '' }) {
  return (
    <button type="button" title={title} aria-label={title} disabled={disabled} onClick={onClick}
      className={`icon-btn${small ? ' sm' : ''}${danger ? ' danger' : ''}${active ? ' active' : ''} ${className}`.trim()}>
      <Icon name={icon} size={size} />
    </button>
  );
}

/* ==========================================================================
   LIST ROW
   ========================================================================== */
export function List({ children, bordered, hoverable }) {
  return <div className={`list${bordered ? ' bordered' : ''}${hoverable ? ' hoverable' : ''}`}>{children}</div>;
}

export function ListRow({ icon, iconColor, title, subtitle, children, end, ltr }) {
  return (
    <div className="list-row">
      {icon && (
        <span className="list-row-icon" style={iconColor ? { color: iconColor, background: `color-mix(in srgb, ${iconColor} 14%, transparent)` } : undefined}>
          <Icon name={icon} size={15} />
        </span>
      )}
      <div className="list-row-main">
        {title && <div className="list-row-title" dir={ltr ? 'ltr' : undefined}>{title}</div>}
        {subtitle && <div className="list-row-sub" dir={ltr ? 'ltr' : undefined}>{subtitle}</div>}
        {children}
      </div>
      {end && <div className="list-row-end">{end}</div>}
    </div>
  );
}

/** Key/value pair row. */
export function KV({ label, icon, children }) {
  return (
    <div className="kv">
      <span>{icon && <Icon name={icon} size={14} />}{label}</span>
      <span>{children}</span>
    </div>
  );
}

/* ==========================================================================
   CODE BLOCK
   ========================================================================== */
export function CodeBlock({ title, children, center, compact, copyable, onCopy }) {
  const [copied, setCopied] = useState(false);
  const text = typeof children === 'string' ? children : null;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text ?? '');
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
      onCopy?.();
    } catch { /* clipboard unavailable */ }
  };
  return (
    <div className={`code-block${center ? ' center' : ''}${compact ? ' compact' : ''}`}>
      {(title || (copyable && text)) && (
        <div className="code-block-head">
          <span className="spacer">{title}</span>
          {copyable && text && (
            <button className="btn xs ghost" onClick={copy}>
              <Icon name={copied ? 'check' : 'copy'} size={12} />
              {copied ? 'کپی شد' : 'کپی'}
            </button>
          )}
        </div>
      )}
      <pre>{children}</pre>
    </div>
  );
}

/* ==========================================================================
   NOTICE
   ========================================================================== */
export function Notice({ kind = 'info', title, children, icon, actions }) {
  const defIcon = { info: 'info', warn: 'alert', bad: 'xCircle', good: 'checkCircle' }[kind] ?? 'info';
  return (
    <div className={`notice ${kind}`}>
      <Icon name={icon ?? defIcon} size={16} />
      <div className="notice-body">
        {title && <span className="notice-title">{title}</span>}
        {children && <span>{children}</span>}
      </div>
      {actions && <div className="row tight">{actions}</div>}
    </div>
  );
}

/* ==========================================================================
   EMPTY STATE
   ========================================================================== */
export function EmptyState({ icon = 'database', title, text, action }) {
  return (
    <div className="empty">
      <div className="empty-icon"><Icon name={icon} size={24} /></div>
      <div className="empty-title">{title ?? t('no_data')}</div>
      {text && <div className="empty-text">{text}</div>}
      {action && <div className="mt">{action}</div>}
    </div>
  );
}

/* ==========================================================================
   AVATAR
   ========================================================================== */
export function Avatar({ name, size, plain, icon }) {
  const initial = (name ?? '?').trim().charAt(0).toUpperCase() || '?';
  return (
    <span className={`avatar${size ? ` ${size}` : ''}${plain ? ' plain' : ''}`}>
      {icon ? <Icon name={icon} size={16} /> : initial}
    </span>
  );
}

/* ==========================================================================
   DATA TABLE
   ========================================================================== */
export function DataTable({ columns, rows, pageSize = 15, emptyText, emptyIcon, loading, dense }) {
  const [sort, setSort] = useState(null);
  const [page, setPage] = useState(0);

  const sorted = useMemo(() => {
    if (!sort) return rows ?? [];
    const col = columns[sort.index];
    if (!col) return rows ?? [];
    const factor = sort.dir === 'asc' ? 1 : -1;
    return [...(rows ?? [])].sort((a, b) => {
      const va = col.sortValue ? col.sortValue(a) : a[col.key];
      const vb = col.sortValue ? col.sortValue(b) : b[col.key];
      return typeof va === 'number' && typeof vb === 'number'
        ? (va - vb) * factor
        : String(va ?? '').localeCompare(String(vb ?? ''), 'fa') * factor;
    });
  }, [rows, sort, columns]);

  useEffect(() => {
    setPage((p) => Math.min(p, Math.max(0, Math.ceil((rows?.length ?? 0) / pageSize) - 1)));
  }, [rows?.length, pageSize]);

  if (loading) {
    return (
      <div className="table-wrap">
        <div style={{ padding: 'var(--sp-4)', display: 'flex', flexDirection: 'column', gap: 'var(--sp-4)' }}>
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="skeleton" style={{ width: `${94 - i * 9}%`, height: 13 }} />
          ))}
        </div>
      </div>
    );
  }

  if (!rows?.length) {
    return (
      <div className="table-wrap">
        <EmptyState icon={emptyIcon} title={emptyText ?? t('no_data')} />
      </div>
    );
  }

  const pageRows = sorted.slice(page * pageSize, (page + 1) * pageSize);
  const pages = Math.max(1, Math.ceil(sorted.length / pageSize));

  return (
    <div className="table-wrap">
      <table className={`table${dense ? ' dense' : ''}`}>
        <thead>
          <tr>
            {columns.map((c, i) => (
              <th key={c.key} style={c.width ? { width: c.width } : undefined}
                className={c.sortable === false ? undefined : 'sortable'}
                onClick={() => c.sortable !== false && setSort((s) =>
                  s?.index === i ? { index: i, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { index: i, dir: 'asc' })}>
                {c.label}
                {sort?.index === i && (
                  <span className="sort-ind"><Icon name={sort.dir === 'asc' ? 'chevronUp' : 'chevronDown'} size={11} /></span>
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {pageRows.map((row, ri) => (
            <tr key={row.id ?? ri}>
              {columns.map((c) => (
                <td key={c.key} className={c.cellClass}>
                  {c.render ? c.render(row) : (row[c.key] ?? '—')}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {pages > 1 && (
        <div className="table-foot">
          <span>
            {fmtNum(page * pageSize + 1)}–{fmtNum(Math.min((page + 1) * pageSize, sorted.length))} از {fmtNum(sorted.length)}
          </span>
          <div className="row tight">
            <IconButton small icon="chevronRight" title="قبلی" disabled={page === 0} onClick={() => setPage(page - 1)} />
            <span className="num xs">{fmtNum(page + 1)} / {fmtNum(pages)}</span>
            <IconButton small icon="chevronLeft" title="بعدی" disabled={page >= pages - 1} onClick={() => setPage(page + 1)} />
          </div>
        </div>
      )}
    </div>
  );
}

/* ==========================================================================
   METRIC CARD
   ========================================================================== */
export function MetricCard({ label, value, hint, accent, icon, unit, trend, muted }) {
  return (
    <div className="metric" style={accent ? { '--accent': accent } : undefined}>
      <div className="metric-head">
        {icon && <span className="metric-icon"><Icon name={icon} size={15} /></span>}
        <span className="metric-label" title={typeof label === 'string' ? label : undefined}>{label}</span>
      </div>
      <span className={`metric-value${muted ? ' is-text' : ' num'}`}>
        {value}
        {unit && <span className="unit">{unit}</span>}
      </span>
      {hint && (
        <span className="metric-hint">
          {trend != null && <Icon name={trend >= 0 ? 'trendUp' : 'arrowDown'} size={11} />}
          {hint}
        </span>
      )}
    </div>
  );
}

/* ==========================================================================
   CHART — smooth SVG area chart with hover tooltip
   ========================================================================== */
export function Chart({ data, height = 140, color = 'var(--primary)', label, format = fmtNum }) {
  const gradId = useId();
  const [hover, setHover] = useState(null);

  const points = (data ?? []).filter((v) => v != null);

  if (points.length < 2) {
    return (
      <div className="chart-empty" style={{ height }}>
        {label ? `${label} — ` : ''}داده‌ای برای نمایش نیست
      </div>
    );
  }

  const max = Math.max(...points, 1e-9);
  const min = Math.min(...points, 0);
  const range = max - min || 1;
  const w = 100, h = 100;
  const coords = points.map((v, i) => [
    (i / (points.length - 1)) * w,
    h - ((v - min) / range) * (h - 10) - 5,
  ]);

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
    const raw = (e.clientX - rect.left) / rect.width;
    const xPct = Math.min(1, Math.max(0, raw));
    setHover({ index: Math.round(xPct * (points.length - 1)) });
  };

  const hx = hover ? coords[hover.index][0] : 0;
  const hy = hover ? coords[hover.index][1] : 0;

  return (
    <div className="chart" onMouseLeave={() => setHover(null)}>
      <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none"
        style={{ height, cursor: 'crosshair' }} onMouseMove={onMove} role="img" aria-label={label}>
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.32" />
            <stop offset="100%" stopColor={color} stopOpacity="0.01" />
          </linearGradient>
        </defs>
        {[20, 40, 60, 80].map((y) => (
          <line key={y} x1="0" x2={w} y1={y} y2={y} stroke="var(--border-soft)"
            strokeWidth="1" vectorEffect="non-scaling-stroke" />
        ))}
        <path d={area} fill={`url(#${gradId})`} />
        <path d={line} fill="none" stroke={color} strokeWidth="2" vectorEffect="non-scaling-stroke"
          strokeLinejoin="round" strokeLinecap="round" />
        {hover && (
          <g>
            <line x1={hx} x2={hx} y1="0" y2={h} stroke={color} strokeWidth="1"
              strokeDasharray="3 3" vectorEffect="non-scaling-stroke" opacity="0.55" />
            <circle cx={hx} cy={hy} r="3.4" fill={color} stroke="var(--surface)"
              strokeWidth="2" vectorEffect="non-scaling-stroke" />
          </g>
        )}
      </svg>
      {hover && (
        <div className="chart-tip" style={{ left: `${hx}%`, top: `${(hy / 100) * height}px` }}>
          {format(points[hover.index])}
        </div>
      )}
    </div>
  );
}

/* ==========================================================================
   MODAL
   ========================================================================== */
export function Modal({ title, icon, onClose, children, footer, wide, narrow }) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose?.();
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [onClose]);

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}>
      <div className={`modal${wide ? ' wide' : ''}${narrow ? ' narrow' : ''}`}
        role="dialog" aria-modal="true" aria-label={typeof title === 'string' ? title : 'dialog'}>
        <div className="modal-head">
          {icon && <span className="card-head-icon"><Icon name={icon} size={16} /></span>}
          <h3 className="modal-title">{title}</h3>
          <IconButton small icon="x" title={t('cancel')} onClick={onClose} />
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}

export function ConfirmDialog({ title, message, onConfirm, onClose, confirmLabel, kind = 'danger' }) {
  return (
    <Modal
      narrow
      icon={kind === 'danger' ? 'alert' : 'info'}
      title={title ?? 'تأیید عملیات'}
      onClose={onClose}
      footer={
        <>
          <div className="spacer" />
          <button className="btn" onClick={onClose}>{t('cancel')}</button>
          <button className={`btn ${kind} solid`} onClick={() => { onConfirm(); onClose(); }}>
            <Icon name={kind === 'danger' ? 'trash' : 'check'} size={14} />
            {confirmLabel ?? 'تأیید'}
          </button>
        </>
      }
    >
      <p className="muted" style={{ lineHeight: 'var(--lh-normal)' }}>{message}</p>
    </Modal>
  );
}

/* ==========================================================================
   STATUS BADGE
   ========================================================================== */
const STATUS_MAP = {
  active: ['success', 'فعال'], enabled: ['success', 'فعال'], healthy: ['success', 'سالم'],
  online: ['success', 'آنلاین'], up: ['success', 'برقرار'], ok: ['success', 'سالم'],
  success: ['success', 'موفق'], done: ['success', 'انجام شد'], resolved: ['success', 'حل شد'],
  closed: ['success', 'بسته'], connected: ['success', 'متصل'], verified: ['success', 'تأییدشده'],
  degraded: ['warning', 'افت کیفیت'], warning: ['warning', 'هشدار'], warn: ['warning', 'هشدار'],
  pending: ['warning', 'در انتظار'], half_open: ['warning', 'نیم‌باز'], stale: ['warning', 'کهنه'],
  new: ['info', 'جدید'], acknowledged: ['info', 'بررسی شد'], info: ['info', 'اطلاع'],
  down: ['danger', 'قطع'], offline: ['danger', 'آفلاین'], failed: ['danger', 'ناموفق'],
  error: ['danger', 'خطا'], open: ['danger', 'باز'], critical: ['danger', 'بحرانی'],
  blocked: ['danger', 'مسدود'], high: ['danger', 'بالا'],
  medium: ['warning', 'متوسط'], low: ['info', 'کم'],
  disabled: ['neutral', 'غیرفعال'], expired: ['neutral', 'منقضی'], unknown: ['neutral', 'نامشخص'],
  orphaned: ['neutral', 'بی‌سرپرست'], inactive: ['neutral', 'غیرفعال'],
  shadow_ignored: ['warning', 'شادو (نادیده)'],
};

export function StatusBadge({ value, label }) {
  const key = String(value ?? '').toLowerCase();
  const [kind, fa] = STATUS_MAP[key] ?? ['neutral', value ?? '—'];
  return <span className={`badge ${kind}`}><span className="dot" />{label ?? fa}</span>;
}

/** Severity badge (moderation): distinct from status. */
export function SeverityBadge({ value }) {
  const map = { critical: 'danger', high: 'danger', medium: 'warning', low: 'info', none: 'neutral' };
  const fa = { critical: 'بحرانی', high: 'بالا', medium: 'متوسط', low: 'کم', none: 'ندارد' };
  const k = String(value ?? '').toLowerCase();
  return <span className={`badge ${map[k] ?? 'neutral'}`}>{fa[k] ?? value ?? '—'}</span>;
}

/* ==========================================================================
   PROGRESS / SPINNER / PULSE
   ========================================================================== */
export function Progress({ pct, thick }) {
  const p = Math.min(100, Math.max(0, pct ?? 0));
  const kind = p >= 90 ? 'bad' : p >= 75 ? 'warn' : 'ok';
  return (
    <div className={`progress${thick ? ' thick' : ''}`} role="progressbar"
      aria-valuenow={Math.round(p)} aria-valuemin={0} aria-valuemax={100}>
      <div className={`bar ${kind}`} style={{ width: `${p}%` }} />
    </div>
  );
}

export function Spinner({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      style={{ animation: 'spin 0.9s linear infinite' }} aria-label={t('loading')}>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity=".22" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

export function Pulse({ kind = 'ok' }) {
  return <span className={`pulse ${kind}`} aria-hidden="true" />;
}

/** Full-panel loading placeholder. */
export function LoadingBlock({ rows = 4 }) {
  return (
    <div className="card">
      <div className="card-body">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="skeleton" style={{ width: `${92 - i * 11}%`, height: 13 }} />
        ))}
      </div>
    </div>
  );
}

import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { t } from '../lib/i18n.js';

/** Ctrl+K command palette: navigate, search, toggle theme. */
export function CommandPalette({ open, onClose, commands }) {
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(0);
  const inputRef = useRef(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (open) { setQuery(''); setSelected(0); setTimeout(() => inputRef.current?.focus(), 30); }
  }, [open]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return commands.filter((c) => !q || c.label.toLowerCase().includes(q) || (c.keywords ?? '').toLowerCase().includes(q));
  }, [commands, query]);

  if (!open) return null;

  const run = (cmd) => { cmd.run(navigate); onClose(); };

  return (
    <div className="cmdk-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="cmdk" role="dialog" aria-modal="true" aria-label="command palette">
        <input
          ref={inputRef} className="cmdk-input" value={query}
          placeholder={t('search')}
          onChange={(e) => { setQuery(e.target.value); setSelected(0); }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') { e.preventDefault(); setSelected((s) => Math.min(s + 1, filtered.length - 1)); }
            if (e.key === 'ArrowUp') { e.preventDefault(); setSelected((s) => Math.max(s - 1, 0)); }
            if (e.key === 'Enter' && filtered[selected]) run(filtered[selected]);
            if (e.key === 'Escape') onClose();
          }}
        />
        {filtered.map((cmd, i) => (
          <div key={cmd.label} className={`cmdk-item${i === selected ? ' selected' : ''}`}
            onMouseEnter={() => setSelected(i)} onClick={() => run(cmd)}>
            <span>{cmd.icon}</span><span>{cmd.label}</span>
            {cmd.hint && <span className="cmdk-hint">{cmd.hint}</span>}
          </div>
        ))}
        {filtered.length === 0 && <div className="cmdk-item muted">{t('no_data')}</div>}
      </div>
    </div>
  );
}

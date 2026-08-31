export { DataTable, MetricCard, Chart, Modal, ConfirmDialog, StatusBadge, Progress } from './ui.jsx';

/** Tab strip (extracted so pages don't import from each other). */
export function Tabs({ tabs, active, onChange }) {
  return (
    <div className="tabs">
      {tabs.map((tab) => (
        <button key={tab} className={`tab${active === tab ? ' active' : ''}`} onClick={() => onChange(tab)}>
          {tab}
        </button>
      ))}
    </div>
  );
}

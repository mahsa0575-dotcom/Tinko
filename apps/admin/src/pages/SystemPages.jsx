import { useCallback, useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { fmtNum, fmtTime, t } from '../lib/i18n.js';
import {
  DataTable, PageHeader, SectionCard, List, ListRow, EmptyState, KV, Spinner, LoadingBlock,
} from '../components/ui.jsx';
import { useStore } from '../state/store.jsx';
import { Icon } from '../components/icons.jsx';

/* ==========================================================================
   AUDIT LOG
   ========================================================================== */
export function AuditPage() {
  const { toast } = useStore();
  const [rows, setRows] = useState(null);
  const load = useCallback(
    () => api('/audit?limit=100').then(setRows).catch((e) => toast(e.message, 'error')),
    [toast],
  );
  useEffect(() => { load(); }, [load]);

  return (
    <div className="page">
      <PageHeader
        icon="file"
        title={t('audit')}
        subtitle="تمام اقدامات مدیریتی به‌صورت تغییرناپذیر ثبت می‌شوند. گذرواژه‌ها و کلیدها هرگز ذخیره نمی‌شوند."
        actions={
          <button className="btn sm" onClick={load}>
            <Icon name="refresh" size={13} />{t('refresh')}
          </button>
        }
      />
      <DataTable
        loading={!rows}
        rows={rows}
        emptyIcon="file"
        emptyText="رخدادی ثبت نشده است"
        columns={[
          { key: 'created_at', label: t('col_time'), render: (r) => <span className="nowrap">{fmtTime(r.created_at)}</span> },
          { key: 'actor_email', label: t('col_actor'), render: (r) => <span className="cell-strong">{r.actor_email ?? r.actor_kind ?? '—'}</span> },
          { key: 'action', label: t('col_action'), render: (r) => <span className="mono xs">{r.action}</span> },
          {
            key: 'entity_type',
            label: t('col_entity'),
            render: (r) => (r.entity_type ? <span className="mono xs">{r.entity_type}#{r.entity_id ?? ''}</span> : '—'),
          },
          { key: 'ip', label: t('col_ip'), render: (r) => <span className="mono xs">{r.ip ?? '—'}</span> },
        ]}
      />
    </div>
  );
}

/* ==========================================================================
   NOTIFICATIONS
   ========================================================================== */
const LEVEL_META = {
  critical: { icon: 'alert', color: 'var(--danger)', accent: 'danger', label: 'بحرانی' },
  warning: { icon: 'alert', color: 'var(--warning)', accent: 'warning', label: 'هشدار' },
  info: { icon: 'info', color: 'var(--info)', accent: null, label: 'اطلاع' },
};

export function NotificationsPage() {
  const { toast } = useStore();
  const [rows, setRows] = useState(null);
  const load = useCallback(
    () => api('/notifications').then(setRows).catch((e) => toast(e.message, 'error')),
    [toast],
  );
  useEffect(() => { load(); }, [load]);

  const acknowledge = async (n) => {
    try {
      await api(`/notifications/${n.id}/acknowledge`, { method: 'POST' });
      toast('اعلان بررسی‌شده علامت خورد', 'success');
      load();
    } catch (err) {
      toast(err.message, 'error');
    }
  };

  const unread = (rows ?? []).filter((n) => n.status === 'new').length;

  return (
    <div className="page">
      <PageHeader
        icon="bell"
        title={t('notifications')}
        subtitle={
          rows
            ? unread
              ? `${fmtNum(unread)} اعلان بررسی‌نشده از مجموع ${fmtNum(rows.length)} اعلان`
              : `همه‌ی ${fmtNum(rows.length)} اعلان بررسی شده‌اند`
            : 'رخدادها و هشدارهای سیستمی'
        }
        actions={
          <button className="btn sm" onClick={load}>
            <Icon name="refresh" size={13} />{t('refresh')}
          </button>
        }
      />

      {!rows && <LoadingBlock rows={3} />}

      {rows && rows.length === 0 && (
        <div className="card">
          <EmptyState icon="bell" title="اعلانی وجود ندارد" text="هر رخداد مهم سیستمی در این صفحه نمایش داده می‌شود." />
        </div>
      )}

      {rows && rows.length > 0 && (
        <div className="col">
          {rows.map((n) => {
            const meta = LEVEL_META[n.level] ?? LEVEL_META.info;
            return (
              <div key={n.id} className={`card tight${meta.accent ? ` accent-${meta.accent}` : ''}`}>
                <div className="row top">
                  <span
                    className="list-row-icon"
                    style={{ color: meta.color, background: `color-mix(in srgb, ${meta.color} 14%, transparent)` }}
                  >
                    <Icon name={meta.icon} size={16} />
                  </span>
                  <div className="spacer col tight">
                    <div className="row tight wrap">
                      <span className="strong">{n.title}</span>
                      <span className={`badge ${n.level === 'critical' ? 'danger' : n.level === 'warning' ? 'warning' : 'info'}`}>
                        {meta.label}
                      </span>
                      {n.status === 'new' && <span className="badge primary">جدید</span>}
                    </div>
                    {n.body && <div className="muted sm">{n.body}</div>}
                    <div className="faint xs row tight">
                      <Icon name="clock" size={11} />{fmtTime(n.created_at)}
                      {n.channel && <><span>·</span><span className="mono">{n.channel}</span></>}
                    </div>
                  </div>
                  {n.status === 'new' && (
                    <button className="btn sm subtle" onClick={() => acknowledge(n)}>
                      <Icon name="check" size={13} />بررسی شد
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ==========================================================================
   SYSTEM HEALTH
   ========================================================================== */
export function HealthPage() {
  const { toast } = useStore();
  const [health, setHealth] = useState(null);
  const [diag, setDiag] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(
    () => api('/system/health').then(setHealth).catch((e) => toast(e.message, 'error')),
    [toast],
  );
  useEffect(() => {
    load();
    const h = setInterval(load, 10_000);
    return () => clearInterval(h);
  }, [load]);

  const runDiagnostics = async () => {
    setBusy(true);
    try {
      setDiag(await api('/system/diagnostics', { method: 'GET' }));
      toast('عیب‌یابی انجام شد', 'success');
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const pulseKind = (status) => (status === 'online' ? 'ok' : status === 'degraded' ? 'warn' : 'bad');

  return (
    <div className="page">
      <PageHeader
        icon="heart"
        title={t('health')}
        subtitle="وضعیت لحظه‌ای سرویس‌ها، مدارشکن تأمین‌کنندگان و ابزار عیب‌یابی زیرساخت"
        actions={
          <>
            <button className="btn sm" onClick={load}>
              <Icon name="refresh" size={13} />{t('refresh')}
            </button>
            <button className="btn sm primary" onClick={runDiagnostics} disabled={busy}>
              {busy ? <><Spinner size={13} />{t('loading')}</> : <><Icon name="activity" size={13} />اجرای عیب‌یابی</>}
            </button>
          </>
        }
      />

      <div className="grid grid-2">
        <SectionCard
          icon="globe"
          title="سرویس‌ها"
          subtitle="گزارش سلامت هر سرویس در ۶۰ ثانیه گذشته"
          footer={
            health && (
              <>
                <span className="badge info">پایگاه داده {fmtNum(health.database?.latencyMs)}ms</span>
                <span className={`badge ${health.redis?.ok ? 'success' : 'neutral'}`}>
                  Redis {health.redis?.ok ? `${fmtNum(health.redis.latencyMs)}ms` : '—'}
                </span>
                <div className="spacer" />
                <span className="badge neutral">v{health.version} · {health.environment}</span>
              </>
            )
          }
        >
          {!health && <div className="skeleton" style={{ height: 90 }} />}
          {health && (health.services ?? []).length === 0 && (
            <EmptyState icon="globe" title="سرویسی گزارش نشده" text="هیچ سرویسی وضعیت خود را ارسال نکرده است." />
          )}
          {health && (health.services ?? []).length > 0 && (
            <div className="kv-list">
              {health.services.map((s) => (
                <KV key={s.service} label={<span className="mono">{s.service}</span>}>
                  <span className="status-pill">
                    <span className={`pulse ${pulseKind(s.status)}`} />
                    {s.status === 'online' ? 'آنلاین' : s.status === 'degraded' ? 'افت کیفیت' : 'قطع'}
                  </span>
                </KV>
              ))}
            </div>
          )}
        </SectionCard>

        <SectionCard
          icon="zap"
          title="مدارشکن تأمین‌کنندگان"
          subtitle="در صورت خطای پیوسته، تأمین‌کننده موقتاً از چرخه خارج می‌شود"
        >
          {!health && <div className="skeleton" style={{ height: 90 }} />}
          {health && (health.circuitBreakers ?? []).length === 0 && (
            <div className="notice good">
              <Icon name="checkCircle" size={16} />
              <div className="notice-body">
                <span className="notice-title">همه سالم هستند</span>
                <span>هیچ مدارشکنی فعال نشده است.</span>
              </div>
            </div>
          )}
          {(health?.circuitBreakers ?? []).length > 0 && (
            <div className="kv-list">
              {health.circuitBreakers.map((b) => (
                <KV key={b.providerId} label={<span className="mono">provider #{b.providerId}</span>}>
                  <span className={`badge ${b.state === 'closed' ? 'success' : b.state === 'half_open' ? 'warning' : 'danger'}`}>
                    {b.state === 'closed' ? 'بسته (سالم)' : b.state === 'half_open' ? 'نیم‌باز' : 'باز (قطع)'}
                  </span>
                </KV>
              ))}
            </div>
          )}
        </SectionCard>
      </div>

      {diag && (
        <SectionCard icon="activity" title="نتیجهٔ عیب‌یابی" subtitle="بررسی مستقیم هر مؤلفهٔ زیرساخت">
          <List bordered>
            {diag.checks.map((c) => (
              <ListRow
                key={c.name}
                icon={c.ok ? 'checkCircle' : 'xCircle'}
                iconColor={c.ok ? 'var(--success)' : 'var(--danger)'}
                title={<span className="mono">{c.name}</span>}
                subtitle={c.ok ? undefined : c.error}
                end={
                  <span className={`badge ${c.ok ? 'success' : 'danger'}`}>
                    {c.ok ? `سالم · ${fmtNum(c.latencyMs)}ms` : 'ناموفق'}
                  </span>
                }
              />
            ))}
          </List>
        </SectionCard>
      )}
    </div>
  );
}

/** Platform routes: analytics, audit logs, notifications, system health, metrics. */
export async function registerPlatformRoutes(fastify, { ctx }) {
  const { repos, pool, router } = ctx;
  const guard = (perm) => ({ onRequest: [fastify.authenticate, fastify.requirePermission(perm)] });

  // ---------- Analytics ----------
  fastify.get('/analytics/summary', guard('analytics.read'), async (req) => {
    const since = new Date(Date.now() - 24 * 3600 * 1000);
    const [usage, groups, users, messages] = await Promise.all([
      repos.ops.usageSummary(1, since),
      pool.query(`SELECT count(*)::int AS total, count(*) FILTER (WHERE last_activity > now() - interval '24 hours')::int AS active_24h FROM telegram_groups WHERE tenant_id = 1 AND status <> 'orphaned'`),
      pool.query(`SELECT count(*)::int AS total, count(*) FILTER (WHERE last_seen_at > now() - interval '24 hours')::int AS active_24h FROM telegram_users WHERE tenant_id = 1`),
      pool.query(`SELECT count(*)::int AS n FROM messages WHERE tenant_id = 1 AND created_at > now() - interval '24 hours'`),
    ]);
    return {
      usage: usage,
      groups: groups.rows[0],
      users: users.rows[0],
      messages24h: messages.rows[0].n,
    };
  });

  fastify.get('/analytics/timeseries', guard('analytics.read'), async (req) => {
    const { metric = 'ai_requests', hours = 24 } = req.query;
    const since = new Date(Date.now() - Math.min(Number(hours), 24 * 30) * 3600 * 1000);
    if (metric === 'ai_requests' || metric === 'tokens' || metric === 'cost' || metric === 'errors') {
      const agg = metric === 'ai_requests' ? 'count(*)'
        : metric === 'tokens' ? 'COALESCE(sum(tokens_in + tokens_out),0)'
        : metric === 'cost' ? 'COALESCE(sum(cost),0)'
        : 'count(*) FILTER (WHERE status = \'error\')';
      const { rows } = await pool.query(
        `SELECT date_trunc('hour', created_at) AS bucket, ${agg}::float AS value
         FROM usage_records WHERE tenant_id = 1 AND created_at >= $1
         GROUP BY bucket ORDER BY bucket`, [since]);
      return rows;
    }
    if (metric === 'messages') {
      const { rows } = await pool.query(
        `SELECT date_trunc('hour', created_at) AS bucket, count(*)::float AS value
         FROM messages WHERE tenant_id = 1 AND created_at >= $1
         GROUP BY bucket ORDER BY bucket`, [since]);
      return rows;
    }
    if (metric === 'moderation') {
      const { rows } = await pool.query(
        `SELECT date_trunc('hour', created_at) AS bucket, count(*)::float AS value
         FROM moderation_events WHERE tenant_id = 1 AND created_at >= $1
         GROUP BY bucket ORDER BY bucket`, [since]);
      return rows;
    }
    throw Errors.validation([{ message: 'unknown metric' }]);
  });

  // ---------- Audit ----------
  fastify.get('/audit', guard('logs.read'), async (req) => {
    const { limit = 50, offset = 0 } = req.query;
    return repos.ops.listAudit(1, { limit: Math.min(Number(limit), 200), offset: Number(offset) });
  });

  // ---------- Notifications ----------
  fastify.get('/notifications', guard('logs.read'), async (req) =>
    repos.ops.listNotifications(1, { status: req.query.status, limit: Math.min(Number(req.query.limit) || 50, 200) }));

  fastify.post('/notifications/:id/acknowledge', guard('logs.read'), async (req) => {
    await pool.query(`UPDATE notifications SET status = 'acknowledged' WHERE id = $1 AND tenant_id = 1`, [req.params.id]);
    return { ok: true };
  });

  // ---------- System / health ----------
  fastify.get('/system/health', guard('analytics.read'), async () => {
    const dbStart = Date.now();
    await pool.query('SELECT 1');
    const dbLatency = Date.now() - dbStart;
    let redisOk = true, redisLatency = null;
    try {
      const r = Date.now();
      await ctx.redis.ping();
      redisLatency = Date.now() - r;
    } catch { redisOk = false; }
    const services = await repos.ops.serviceHealth();
    const breakers = router.breakerSnapshot();
    return {
      status: dbOk(dbLatency) && redisOk ? 'healthy' : 'degraded',
      database: { ok: true, latencyMs: dbLatency },
      redis: { ok: redisOk, latencyMs: redisLatency },
      services, circuitBreakers: breakers,
      version: process.env.npm_package_version ?? '0.1.0',
      environment: ctx.config.NODE_ENV,
      serverTime: new Date().toISOString(),
    };
  });

  fastify.get('/system/diagnostics', guard('system.manage'), async () => {
    const checks = [];
    const add = async (name, fn) => {
      const started = Date.now();
      try {
        await fn();
        checks.push({ name, ok: true, latencyMs: Date.now() - started });
      } catch (err) {
        checks.push({ name, ok: false, latencyMs: Date.now() - started, error: err.message });
      }
    };
    await add('database', async () => pool.query('SELECT 1'));
    await add('redis', async () => ctx.redis.ping());
    await add('migrations', async () => {
      const { rows } = await pool.query(`SELECT count(*)::int AS n FROM schema_migrations`);
      if (rows[0].n === 0) throw new Error('no migrations applied');
    });
    return { checks, generatedAt: new Date().toISOString() };
  });

  // ---------- Resource metrics (real VPS data written by the worker) ----------
  fastify.get('/resources/latest', guard('analytics.read'), async () => {
    const latest = await repos.ops.latestResourceMetrics();
    if (!latest) return { available: false, reason: 'هیچ داده‌ای از جمع‌آوری متریک‌ها دریافت نشده است' };
    const thresholds = await repos.ops.getSetting('resource_thresholds', DEFAULT_THRESHOLDS);
    const health = computeHealthScore(latest, thresholds);
    return { available: true, health, thresholds, ...latest };
  });

  fastify.get('/resources/history', guard('analytics.read'), async (req) => {
    const { minutes = 60, resolution = 'raw' } = req.query;
    const since = new Date(Date.now() - Math.min(Number(minutes), 60 * 24 * 30) * 60 * 1000);
    if (resolution === '1m' || resolution === '5m' || resolution === '1h') {
      return (await pool.query(
        `SELECT * FROM resource_aggregates WHERE resolution = $1 AND bucket_start >= $2 ORDER BY bucket_start`,
        [resolution, since])).rows;
    }
    return (await pool.query(
      `SELECT captured_at, cpu_percent, mem_used, mem_total, swap_used, swap_total, load_avg, disks, net
       FROM resource_metrics WHERE captured_at >= $1 ORDER BY captured_at`,
      [since])).rows;
  });

  // ---------- Export (spec §71): CSV / JSON, streamed ----------
  fastify.get('/analytics/export', guard('analytics.read'), async (req, reply) => {
    const { hours = 24, format = 'csv' } = req.query;
    const since = new Date(Date.now() - Math.min(Number(hours), 24 * 30) * 3600 * 1000);
    const { rows } = await pool.query(
      `SELECT u.created_at, u.request_kind, u.tokens_in, u.tokens_out, u.cost, u.currency,
              u.latency_ms, u.status, u.error_code, p.slug AS provider, m.identifier AS model,
              g.title AS "group", u.ai_request_id
       FROM usage_records u
       LEFT JOIN providers p ON p.id = u.provider_id
       LEFT JOIN models m ON m.id = u.model_id
       LEFT JOIN telegram_groups g ON g.id = u.group_id
       WHERE u.tenant_id = 1 AND u.created_at >= $1
       ORDER BY u.created_at DESC LIMIT 50000`, [since]);

    const filename = `botai-usage-${new Date().toISOString().slice(0, 10)}`;
    if (format === 'json') {
      reply.header('content-type', 'application/json; charset=utf-8');
      reply.header('content-disposition', `attachment; filename="${filename}.json"`);
      return rows;
    }
    const headers = ['created_at', 'request_kind', 'provider', 'model', 'group',
      'tokens_in', 'tokens_out', 'cost', 'currency', 'latency_ms', 'status', 'error_code', 'ai_request_id'];
    const escape = (v) => {
      const s = v == null ? '' : String(v);
      return /[",\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
    };
    const csv = [headers.join(',')]
      .concat(rows.map((r) => headers.map((h) => escape(r[h])).join(',')))
      .join('\n');
    reply.header('content-type', 'text/csv; charset=utf-8');
    reply.header('content-disposition', `attachment; filename="${filename}.csv"`);
    return csv;
  });

  function dbOk(latencyMs) { return latencyMs < 2000; }
}

import { DEFAULT_THRESHOLDS } from './debug-routes.js';

/**
 * VPS health score (spec §94): Excellent → Critical from real metrics and
 * configurable thresholds. Actual metrics always travel alongside the score.
 */
export function computeHealthScore(metrics, thresholds) {
  const worst = (level) => {
    const order = ['excellent', 'healthy', 'degraded', 'warning', 'critical'];
    return order.indexOf(level);
  };
  const pick = (pct, t) =>
    pct >= (t.critical ?? 100) ? 'critical'
      : pct >= (t.high ?? 100) ? 'warning'
      : pct >= (t.warning ?? 100) ? 'degraded' : 'healthy';

  const levels = [];
  if (metrics.cpu_percent != null) levels.push(pick(metrics.cpu_percent, thresholds.cpu ?? {}));
  const memPct = metrics.mem_total ? (metrics.mem_used / metrics.mem_total) * 100 : null;
  if (memPct != null) levels.push(pick(memPct, thresholds.ram ?? {}));
  const swapPct = metrics.swap_total ? (metrics.swap_used / metrics.swap_total) * 100 : null;
  if (swapPct != null) levels.push(pick(swapPct, thresholds.swap ?? {}));
  const rootDisk = (metrics.disks ?? []).find((d) => d.mount === '/') ?? (metrics.disks ?? [])[0];
  if (rootDisk?.pct != null) levels.push(pick(rootDisk.pct, thresholds.disk ?? {}));
  if (metrics.load_avg?.[0] != null && metrics.cpu_cores) {
    const ratio = metrics.load_avg[0] / metrics.cpu_cores;
    levels.push(pick(ratio * 100, thresholds.load ?? {}));
  }
  if (levels.length === 0) return { score: 'unknown', factors: {} };

  const rank = Math.max(...levels.map(worst));
  const order = ['excellent', 'healthy', 'degraded', 'warning', 'critical'];
  const score = order[rank];
  // "excellent" only when everything is comfortably low
  const comfortable = (memPct == null || memPct < 50) && (metrics.cpu_percent ?? 0) < 40
    && (rootDisk?.pct == null || rootDisk.pct < 60);
  return {
    score: score === 'healthy' && comfortable ? 'excellent' : score,
    factors: {
      cpu: metrics.cpu_percent, ram: memPct != null ? Math.round(memPct) : null,
      swap: swapPct != null ? Math.round(swapPct) : null,
      disk: rootDisk?.pct ?? null,
      load_ratio: metrics.cpu_cores ? Math.round((metrics.load_avg?.[0] ?? 0) / metrics.cpu_cores * 100) / 100 : null,
    },
  };
}

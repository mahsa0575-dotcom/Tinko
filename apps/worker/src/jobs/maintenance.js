import { createAdapter } from '@botai/ai';

/**
 * Provider health probing (spec §22): updates provider.health + records a
 * health-check row. Auth failures disable the first key automatically.
 */
export async function runProviderHealth(ctx) {
  const { repos, logger } = ctx;
  const providers = await repos.aiConfig.listProviders(1);
  const results = [];
  for (const provider of providers) {
    if (provider.status !== 'active') continue;
    const key = await repos.aiConfig.getActiveKeySecret(provider.id);
    let result;
    if (!key) {
      result = { ok: false, error: 'no API key configured' };
    } else {
      const adapter = createAdapter(provider, { logger });
      result = await adapter.healthCheck({ apiKey: key.secret }).catch((err) => ({ ok: false, error: err.message }));
    }
    const health = result.ok ? 'healthy' : (result.error?.includes('HTTP 5') ? 'degraded' : 'down');
    await ctx.pool.query(
      `UPDATE providers SET health = $2, health_detail = $3, updated_at = now() WHERE id = $1`,
      [provider.id, health, JSON.stringify({ lastCheck: new Date().toISOString(), error: result.error ?? null })]);
    await ctx.pool.query(
      `INSERT INTO provider_health_checks (provider_id, ok, latency_ms, error) VALUES ($1,$2,$3,$4)`,
      [provider.id, result.ok, result.latencyMs ?? null, result.error ?? null]);
    if (!result.ok) {
      await repos.ops.notify(1, {
        level: 'warning',
        title: `تأمین‌کننده ${provider.display_name} ناسالم است`,
        body: result.error ?? 'unknown error',
        dedupKey: `provider-health:${provider.id}`,
      });
    }
    results.push({ provider: provider.slug, ok: result.ok, latencyMs: result.latencyMs });
    logger.info('provider health checked', { provider: provider.slug, ok: result.ok, latencyMs: result.latencyMs });
  }
  return results;
}

/** Retention: prune raw metrics, expired blacklists, stale notifications. */
export async function runCleanup(ctx) {
  const { pool } = ctx;
  // Raw metrics: 1 hour; 1-minute aggregates: 7 days; 5-minute: 30 days; hourly: 1 year (spec §93)
  await pool.query(`DELETE FROM resource_metrics WHERE captured_at < now() - interval '1 hour'`);
  await pool.query(`DELETE FROM resource_aggregates WHERE resolution = '1m' AND bucket_start < now() - interval '7 days'`);
  await pool.query(`DELETE FROM resource_aggregates WHERE resolution = '5m' AND bucket_start < now() - interval '30 days'`);
  await pool.query(`DELETE FROM resource_aggregates WHERE resolution = '1h' AND bucket_start < now() - interval '1 year'`);
  await pool.query(`DELETE FROM blacklists WHERE expires_at IS NOT NULL AND expires_at < now()`);
  await pool.query(`UPDATE memories SET status = 'expired' WHERE expires_at IS NOT NULL AND expires_at < now()`);
  await pool.query(`DELETE FROM notifications WHERE created_at < now() - interval '30 days'`);
  await pool.query(`DELETE FROM provider_health_checks WHERE checked_at < now() - interval '14 days'`);
  return { ok: true };
}

/** 1-minute aggregation of raw metrics into resource_aggregates. */
export async function runMetricsAggregation(ctx) {
  const { pool } = ctx;
  // Scalar metrics aggregate straight off resource_metrics; the jsonb arrays
  // (disks, net) are expanded in their OWN lateral subqueries so they never
  // cross-multiply each other. jsonb fields are read with ->> (not .field).
  await pool.query(`
    WITH per_minute AS (
      SELECT date_trunc('minute', captured_at) AS bucket,
             avg(cpu_percent) AS cpu_avg, max(cpu_percent) AS cpu_max,
             round(avg(mem_used))::bigint AS mem_avg, max(mem_used) AS mem_max,
             round(avg(swap_used))::bigint AS swap_avg,
             avg(load_avg[1]) AS load_avg
      FROM resource_metrics
      WHERE captured_at >= now() - interval '2 minutes'
      GROUP BY 1
    ),
    disk_agg AS (
      SELECT date_trunc('minute', m.captured_at) AS bucket,
             jsonb_object_agg(d->>'mount', (d->>'pct')::numeric) AS disk_pct
      FROM resource_metrics m, jsonb_array_elements(COALESCE(m.disks, '[]'::jsonb)) AS d
      WHERE m.captured_at >= now() - interval '2 minutes'
      GROUP BY 1
    ),
    net_agg AS (
      SELECT date_trunc('minute', m.captured_at) AS bucket,
             round(sum((n->>'rx_bps')::numeric))::bigint AS net_rx,
             round(sum((n->>'tx_bps')::numeric))::bigint AS net_tx
      FROM resource_metrics m, jsonb_array_elements(COALESCE(m.net, '[]'::jsonb)) AS n
      WHERE m.captured_at >= now() - interval '2 minutes'
      GROUP BY 1
    )
    INSERT INTO resource_aggregates (bucket_start, resolution, cpu_avg, cpu_max, mem_avg, mem_max, swap_avg, disk_pct, net_rx, net_tx, load_avg)
    SELECT pm.bucket, '1m', pm.cpu_avg, pm.cpu_max, pm.mem_avg, pm.mem_max, pm.swap_avg,
           da.disk_pct, na.net_rx, na.net_tx, pm.load_avg
    FROM per_minute pm
    LEFT JOIN disk_agg da ON da.bucket = pm.bucket
    LEFT JOIN net_agg na ON na.bucket = pm.bucket
    ON CONFLICT (resolution, bucket_start) DO UPDATE SET
      cpu_avg = EXCLUDED.cpu_avg, cpu_max = EXCLUDED.cpu_max,
      mem_avg = EXCLUDED.mem_avg, mem_max = EXCLUDED.mem_max,
      swap_avg = EXCLUDED.swap_avg, disk_pct = EXCLUDED.disk_pct,
      net_rx = EXCLUDED.net_rx, net_tx = EXCLUDED.net_tx, load_avg = EXCLUDED.load_avg`);
  return { ok: true };
}

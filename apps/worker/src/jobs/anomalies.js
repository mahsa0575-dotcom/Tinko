/**
 * Anomaly detection (spec §147, §213, §214).
 * Ratio-based sustained detection — never claims a confirmed problem from a
 * single spike; notifications are deduplicated by the ops layer.
 */
export async function runResourceAnomalyScan(ctx) {
  const { pool, repos } = ctx;
  const anomalies = [];

  // Compare last 5 minutes against the previous-hour baseline.
  const { rows } = await pool.query(`
    SELECT
      (SELECT avg(cpu_percent) FROM resource_metrics WHERE captured_at > now() - interval '5 minutes') AS cpu_now,
      (SELECT avg(cpu_percent) FROM resource_metrics WHERE captured_at BETWEEN now() - interval '65 minutes' AND now() - interval '5 minutes') AS cpu_base,
      (SELECT avg(mem_used) FROM resource_metrics WHERE captured_at > now() - interval '5 minutes') AS mem_now,
      (SELECT avg(mem_used) FROM resource_metrics WHERE captured_at BETWEEN now() - interval '65 minutes' AND now() - interval '5 minutes') AS mem_base,
      (SELECT COALESCE(sum((n->>'rx_bps')::bigint + (n->>'tx_bps')::bigint), 0)
        FROM resource_metrics m, jsonb_array_elements(COALESCE(m.net, '[]'::jsonb)) n
        WHERE captured_at > now() - interval '5 minutes') AS net_now,
      (SELECT count(*) FROM resource_metrics WHERE captured_at > now() - interval '5 minutes')::int AS samples`);
  const s = rows[0];
  if (!s || s.samples < 5) return { checked: false, reason: 'not enough samples' };

  if (s.cpu_base != null && s.cpu_now > 70 && s.cpu_now > s.cpu_base * 1.5) {
    anomalies.push({ metric: 'cpu', value: Math.round(s.cpu_now), baseline: Math.round(s.cpu_base) });
  }
  if (s.mem_base > 0 && s.mem_now > s.mem_base * 1.3) {
    anomalies.push({ metric: 'ram', value: Math.round(s.mem_now / 1e6), baseline: Math.round(s.mem_base / 1e6), unit: 'MB' });
  }
  if (s.net_now > 500 * 1e6) { // >500MB transferred in 5 minutes
    anomalies.push({ metric: 'network', value: Math.round(s.net_now / 1e6), unit: 'MB/5min' });
  }

  for (const a of anomalies) {
    await repos.ops.notify(1, {
      level: 'warning',
      title: `ناهنجاری منابع: ${a.metric}`,
      body: `مقدار فعلی ${a.value}${a.unit ?? '٪'} در برابر خط پایه ${a.baseline ?? '—'}${a.baseline != null ? (a.unit ?? '٪') : ''}`,
      dedupKey: `resource-anomaly:${a.metric}`,
    });
  }
  return { checked: true, anomalies };
}

export async function runCostAnomalyScan(ctx) {
  const { pool, repos } = ctx;
  const { rows } = await pool.query(`
    SELECT
      (SELECT COALESCE(sum(cost), 0) FROM usage_records
        WHERE created_at > now() - interval '1 hour') AS cost_now,
      (SELECT avg(h.total) FROM (
         SELECT date_trunc('hour', created_at) AS h, sum(cost) AS total
         FROM usage_records
         WHERE created_at BETWEEN now() - interval '7 days' AND now() - interval '1 hour'
         GROUP BY h) h) AS cost_base`);
  const { cost_now: now, cost_base: base } = rows[0];
  if (Number(base) > 0.01 && Number(now) > Number(base) * 3 && Number(now) > 0.5) {
    await repos.ops.notify(1, {
      level: 'warning',
      title: 'افزایش ناگهانی هزینه‌ی AI',
      body: `هزینه‌ی یک ساعت اخیر ($${Number(now).toFixed(2)}) بیش از ۳ برابر میانگین ۷ روز ($${Number(base).toFixed(2)}) است.`,
      dedupKey: 'cost-anomaly',
    });
    return { anomaly: true, now: Number(now), base: Number(base) };
  }
  return { anomaly: false };
}

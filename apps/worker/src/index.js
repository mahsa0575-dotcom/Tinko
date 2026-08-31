import { Worker } from 'bullmq';
import Redis from 'ioredis';
import { loadConfig, createLogger, setLogLevel, encryptSecret, decryptSecret, maskSecret } from '@botai/core';
import { createPool, createRepos } from '@botai/db';
import { createAiRouter } from '@botai/ai';
import { createQueues } from './queues.js';
import { collectResourceMetrics } from './jobs/metrics.js';
import { runProviderHealth, runCleanup, runMetricsAggregation } from './jobs/maintenance.js';
import { runMemoryExtraction, runMemoryEmbeddingBackfill } from './jobs/memory-extract.js';
import { runResourceAnomalyScan, runCostAnomalyScan } from './jobs/anomalies.js';
import { runAutomations } from './jobs/automations.js';

/**
 * Background worker: metric collection (real VPS data), provider health,
 * aggregation and retention cleanup. Runs as its own process/container.
 */
export async function startWorker(overrides = {}) {
  const config = overrides.config ?? loadConfig();
  setLogLevel(config.LOG_LEVEL);
  const log = overrides.logger ?? createLogger({ service: 'worker' });

  const pool = overrides.pool ?? createPool(config);
  const repos = overrides.repos ?? createRepos(pool, {
    encrypt: (s) => encryptSecret(s, config.ENCRYPTION_KEY),
    decrypt: (s) => decryptSecret(s, config.ENCRYPTION_KEY),
    mask: maskSecret,
  });
  const connection = overrides.connection ?? new Redis(config.REDIS_URL, { maxRetriesPerRequest: null });
  const router = overrides.router ?? createAiRouter({ aiConfigRepo: repos.aiConfig, opsRepo: repos.ops, logger: log });
  const ctx = { config, pool, repos, redis: connection, logger: log, router };

  const { queues, scheduleRecurring } = createQueues(connection);
  if (!overrides.skipSchedule) await scheduleRecurring({ metricsIntervalMs: config.METRICS_INTERVAL_MS });

  const workers = [
    new Worker('metrics', async (job) => {
      if (job.name === 'collect-metrics') {
        const metrics = await collectResourceMetrics();
        await repos.ops.saveResourceMetrics(metrics);
        return { capturedAt: metrics.capturedAt };
      }
      if (job.name === 'aggregate-metrics') return runMetricsAggregation(ctx);
    }, { connection, concurrency: 1 }),

    new Worker('maintenance', async (job) => {
      if (job.name === 'provider-health') return runProviderHealth(ctx);
      if (job.name === 'cleanup') return runCleanup(ctx);
      if (job.name === 'memory-embedding-backfill') return runMemoryEmbeddingBackfill(ctx);
      if (job.name === 'resource-anomaly-scan') return runResourceAnomalyScan(ctx);
      if (job.name === 'cost-anomaly-scan') return runCostAnomalyScan(ctx);
      if (job.name === 'automation-tick') return runAutomations(ctx);
    }, { connection, concurrency: 1 }),

    new Worker('ai', async (job) => {
      if (job.name === 'extract-memory') return runMemoryExtraction(ctx, job);
    }, { connection, concurrency: 2 }),
  ];

  workers.forEach((w) => {
    w.on('failed', (job, err) => log.error('job failed', { queue: w.name, job: job.name, error: err.message, attempts: job.attemptsMade }));
  });

  await repos.ops.heartbeat('worker', new Date()).catch(() => {});
  await repos.ops.heartbeat('scheduler', new Date()).catch(() => {});
  const hb = setInterval(() => {
    repos.ops.heartbeat('worker').catch(() => {});
    repos.ops.heartbeat('scheduler').catch(() => {});
  }, 30_000);

  log.info('worker started', { queues: ['metrics', 'maintenance'], metricsIntervalMs: config.METRICS_INTERVAL_MS });

  const shutdown = async () => {
    log.info('worker shutting down');
    clearInterval(hb);
    await Promise.all(workers.map((w) => w.close().catch(() => {})));
    await repos.ops.markOffline('worker').catch(() => {});
    await repos.ops.markOffline('scheduler').catch(() => {});
    await pool.end().catch(() => {});
    await connection.quit().catch(() => {});
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  return { workers, ctx };
}

if (process.argv[1] && process.argv[1].endsWith('index.js')) {
  startWorker().catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
}

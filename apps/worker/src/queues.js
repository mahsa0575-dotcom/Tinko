import { Queue } from 'bullmq';
import { newJobId } from '@botai/core';

export const QUEUES = {
  metrics: 'metrics',
  maintenance: 'maintenance',
  notifications: 'notifications',
  ai: 'ai',
};

/**
 * Queue definitions + scheduler registration.
 * Queue priorities (spec §132): critical moderation > admin actions >
 * normal AI requests > analytics > maintenance. BullMQ handles ordering per
 * queue; concurrency is set per worker.
 */
export function createQueues(redisConnection) {
  const defaultJobOptions = {
    attempts: 3,
    backoff: { type: 'exponential', delay: 2000 },
    removeOnComplete: { age: 3600, count: 1000 },
    removeOnFail: { age: 24 * 3600 },   // inspectable dead-letter window
  };
  const queues = Object.fromEntries(
    Object.entries(QUEUES).map(([name, q]) => [name, new Queue(q, { connection: redisConnection, defaultJobOptions })]),
  );

  async function scheduleRecurring({ metricsIntervalMs = 2000 } = {}) {
    await queues.metrics.add(
      'collect-metrics', {},
      { repeat: { every: metricsIntervalMs }, jobId: 'collect-metrics' });
    await queues.metrics.add(
      'aggregate-metrics', {},
      { repeat: { every: 60_000 }, jobId: 'aggregate-metrics' });
    await queues.maintenance.add(
      'provider-health', {},
      { repeat: { every: 5 * 60_000 }, jobId: 'provider-health' });
    await queues.maintenance.add(
      'cleanup', {},
      { repeat: { every: 60 * 60_000 }, jobId: 'cleanup' });
    await queues.maintenance.add(
      'memory-embedding-backfill', {},
      { repeat: { every: 6 * 60 * 60_000 }, jobId: 'memory-embedding-backfill' });
    await queues.maintenance.add(
      'resource-anomaly-scan', {},
      { repeat: { every: 5 * 60_000 }, jobId: 'resource-anomaly-scan' });
    await queues.maintenance.add(
      'cost-anomaly-scan', {},
      { repeat: { every: 60 * 60_000 }, jobId: 'cost-anomaly-scan' });
    await queues.maintenance.add(
      'automation-tick', {},
      { repeat: { every: 60_000 }, jobId: 'automation-tick' });
  }

  return { queues, scheduleRecurring };
}

export { newJobId };

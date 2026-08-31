import Redis from 'ioredis';
import { loadConfig, createLogger, encryptSecret, decryptSecret, maskSecret } from '@botai/core';
import { createPool, createRepos } from '@botai/db';
import { createAiRouter } from '@botai/ai';

/**
 * Application context: one instance shared by the HTTP server.
 * Owns config, database pool, repositories, redis, and the AI router.
 * `overrides` lets tests inject fakes.
 */
export async function createContext(overrides = {}) {
  const config = overrides.config ?? loadConfig();
  const logger = overrides.logger ?? createLogger({ service: 'api' });
  const pool = overrides.pool ?? createPool(config);
  const cryptoHelpers = {
    encrypt: (s) => encryptSecret(s, config.ENCRYPTION_KEY),
    decrypt: (s) => decryptSecret(s, config.ENCRYPTION_KEY),
    mask: maskSecret,
  };

  const repos = overrides.repos ?? createRepos(pool, cryptoHelpers);
  const redis = overrides.redis ?? new Redis(config.REDIS_URL, { maxRetriesPerRequest: 3, lazyConnect: true });
  const router = overrides.router ?? createAiRouter({ aiConfigRepo: repos.aiConfig, opsRepo: repos.ops, logger });

  if (!overrides.skipConnect) {
    await redis.connect().catch((err) => {
      logger.error('Redis connection failed', { error: err.message });
      throw err;
    });
    await pool.query('SELECT 1'); // fail fast on bad DB config
  }

  return { config, logger, pool, repos, redis, router };
}

#!/usr/bin/env node
/**
 * Migration runner entrypoint (used by CI, Docker and native deploys).
 * Requires DATABASE_URL; applies pending .sql migrations in order.
 */
import { loadConfig } from '@botai/core';
import { createPool, runMigrations } from '@botai/db';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

try {
  const config = loadConfig();
  const pool = createPool(config);
  const applied = await runMigrations(pool, path.join(root, 'migrations'));
  console.log(applied === 0 ? '[migrate] database already up to date' : `[migrate] done (${applied} new)`);
  await pool.end();
} catch (err) {
  console.error('[migrate] FAILED:', err.message);
  process.exit(1);
}

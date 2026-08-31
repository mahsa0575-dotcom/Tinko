import pg from 'pg';
import { logger } from '@botai/core';

/** Create a pg Pool from config. sslmode is honored via DATABASE_URL. */
export function createPool(config) {
  const pool = new pg.Pool({
    connectionString: config.DATABASE_URL,
    max: config.DATABASE_POOL_MAX,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
    application_name: 'botai',
  });
  pool.on('error', (err) => logger.error('Unexpected PostgreSQL pool error', { err: err.message }));
  return pool;
}

/** Simple query helper bound to a pool/client. */
export const q = (client, text, params) => client.query(text, params);

export async function withTransaction(pool, fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

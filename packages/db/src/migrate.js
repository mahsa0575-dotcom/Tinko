import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

/**
 * Minimal, strict migration runner.
 * - Applies .sql files in lexicographic order, each inside a transaction.
 * - Records applied ids in schema_migrations; never re-applies.
 */
export async function runMigrations(pool, migrationsDir) {
  const client = await pool.connect();
  try {
    await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
      id text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())`);

    const { rows } = await client.query('SELECT id FROM schema_migrations');
    const applied = new Set(rows.map((r) => r.id));

    const files = (await readdir(migrationsDir))
      .filter((f) => f.endsWith('.sql'))
      .sort();

    for (const file of files) {
      const id = file.replace(/\.sql$/, '');
      if (applied.has(id)) continue;
      const sql = await readFile(path.join(migrationsDir, file), 'utf8');
      try {
        await client.query('BEGIN');
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations (id) VALUES ($1)', [id]);
        await client.query('COMMIT');
        console.log(`[migrate] applied ${id}`);
      } catch (err) {
        await client.query('ROLLBACK').catch(() => {});
        throw new Error(`Migration ${id} failed: ${err.message}`);
      }
    }
    return files.length - applied.size;
  } finally {
    client.release();
  }
}

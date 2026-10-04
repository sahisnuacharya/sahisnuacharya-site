import { env } from 'cloudflare:workers';
import { MIGRATIONS } from './migrations';

let ready: Promise<void> | null = null;

async function migrate(database: D1Database): Promise<void> {
  await database
    .prepare(
      `CREATE TABLE IF NOT EXISTS schema_migrations (
        version INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        applied_at TEXT NOT NULL DEFAULT (datetime('now'))
      )`,
    )
    .run();
  const row = await database
    .prepare('SELECT COALESCE(MAX(version), 0) AS v FROM schema_migrations')
    .first<{ v: number }>();
  const current = row?.v ?? 0;
  for (const m of MIGRATIONS) {
    if (m.version <= current) continue;
    // A batch runs as one transaction: a migration is applied fully or not at all.
    await database.batch([
      ...m.statements.map((sql) => database.prepare(sql)),
      database
        .prepare('INSERT OR IGNORE INTO schema_migrations (version, name) VALUES (?, ?)')
        .bind(m.version, m.name),
    ]);
  }
}

/** Returns the database, applying pending migrations once per worker instance. */
export async function getDb(): Promise<D1Database> {
  ready ??= migrate(env.DB).catch((error: unknown) => {
    ready = null;
    throw error;
  });
  await ready;
  return env.DB;
}

import { DatabaseSync } from 'node:sqlite';

export interface Migration {
  version: number;
  name: string;
  upSql: string;
}

export const MIGRATIONS: Migration[] = [
  {
    version: 1,
    name: 'initial_schema',
    upSql: `
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY NOT NULL,
        value_json TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS download_history (
        id TEXT PRIMARY KEY NOT NULL,
        job_id TEXT NOT NULL,
        title TEXT NOT NULL,
        source_url TEXT NOT NULL,
        platform TEXT NOT NULL,
        selected_format TEXT NOT NULL,
        resolution TEXT NOT NULL,
        file_path TEXT NOT NULL,
        file_size_bytes INTEGER NOT NULL DEFAULT 0,
        completed_at TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'completed'
      );

      CREATE INDEX IF NOT EXISTS idx_history_completed_at ON download_history(completed_at DESC);

      CREATE TABLE IF NOT EXISTS persisted_jobs (
        job_id TEXT PRIMARY KEY NOT NULL,
        payload_json TEXT NOT NULL,
        state TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS diagnostics_log (
        id TEXT PRIMARY KEY NOT NULL,
        timestamp TEXT NOT NULL,
        level TEXT NOT NULL,
        category TEXT NOT NULL,
        code TEXT,
        message TEXT NOT NULL,
        redacted_context TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_diagnostics_timestamp ON diagnostics_log(timestamp DESC);
    `,
  },
];

export function runMigrations(db: DatabaseSync): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL
    );
  `);

  const appliedRows = db
    .prepare('SELECT version FROM schema_migrations ORDER BY version ASC')
    .all() as Array<{ version: number }>;
  const appliedVersions = new Set(appliedRows.map((r) => r.version));

  for (const migration of MIGRATIONS) {
    if (appliedVersions.has(migration.version)) {
      continue;
    }
    db.exec('BEGIN TRANSACTION');
    try {
      db.exec(migration.upSql);
      const insertStmt = db.prepare(
        'INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)'
      );
      insertStmt.run(migration.version, migration.name, new Date().toISOString());
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw new Error(
        `Database migration v${migration.version} (${migration.name}) failed: ${
          err instanceof Error ? err.message : String(err)
        }`
      );
    }
  }
}

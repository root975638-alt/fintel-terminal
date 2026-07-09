/**
 * Migration runner — applies numbered SQL migrations idempotently, tracking
 * applied versions in a `schema_migrations` table. Migrations are plain SQL
 * strings (not an ORM DSL) for transparency and easy porting to the optional
 * Postgres backend later (same migration numbering, different SQL dialect file).
 */
import { DatabaseSync } from "node:sqlite";

export interface Migration {
  readonly version: number;
  readonly name: string;
  readonly sql: string;
}

export function runMigrations(db: DatabaseSync, migrations: readonly Migration[]): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at_ms INTEGER NOT NULL
    );
  `);

  const appliedRows = db.prepare("SELECT version FROM schema_migrations").all() as Array<{ version: number }>;
  const applied = new Set(appliedRows.map((r) => r.version));

  const sorted = [...migrations].sort((a, b) => a.version - b.version);
  for (const migration of sorted) {
    if (applied.has(migration.version)) continue;
    db.exec("BEGIN");
    try {
      db.exec(migration.sql);
      db.prepare("INSERT INTO schema_migrations (version, name, applied_at_ms) VALUES (?, ?, ?)").run(
        migration.version,
        migration.name,
        Date.now(),
      );
      db.exec("COMMIT");
    } catch (err) {
      db.exec("ROLLBACK");
      throw new Error(`Migration ${migration.version} ("${migration.name}") failed: ${(err as Error).message}`);
    }
  }
}

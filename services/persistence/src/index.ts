import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { runMigrations } from "./migrationRunner.js";
import { MIGRATIONS } from "./migrations.js";
import { SqliteInstrumentRepository } from "./repositories/sqliteInstrumentRepository.js";
import { SqliteBarRepository } from "./repositories/sqliteBarRepository.js";
import { SqliteNewsRepository } from "./repositories/sqliteNewsRepository.js";
import { SqliteSignalRepository } from "./repositories/sqliteSignalRepository.js";
import { SqliteBacktestRunRepository } from "./repositories/sqliteBacktestRunRepository.js";

export * from "./repositories/ports.js";
export * from "./migrationRunner.js";
export * from "./migrations.js";
export { SqliteInstrumentRepository } from "./repositories/sqliteInstrumentRepository.js";
export { SqliteBarRepository } from "./repositories/sqliteBarRepository.js";
export { SqliteNewsRepository } from "./repositories/sqliteNewsRepository.js";
export { SqliteSignalRepository } from "./repositories/sqliteSignalRepository.js";
export * from "./repositories/sqliteBacktestRunRepository.js";

export interface PersistenceLayer {
  readonly db: DatabaseSync;
  readonly instruments: SqliteInstrumentRepository;
  readonly bars: SqliteBarRepository;
  readonly news: SqliteNewsRepository;
  readonly signals: SqliteSignalRepository;
  readonly backtestRuns: SqliteBacktestRunRepository;
  close(): void;
}

/** Opens (creating if needed) the local SQLite database and applies all migrations. */
export function openPersistenceLayer(sqlitePath: string): PersistenceLayer {
  if (sqlitePath !== ":memory:") {
    mkdirSync(dirname(sqlitePath), { recursive: true });
  }
  const db = new DatabaseSync(sqlitePath);
  db.exec("PRAGMA journal_mode = WAL;");
  db.exec("PRAGMA foreign_keys = ON;");
  runMigrations(db, MIGRATIONS);

  return {
    db,
    instruments: new SqliteInstrumentRepository(db),
    bars: new SqliteBarRepository(db),
    news: new SqliteNewsRepository(db),
    signals: new SqliteSignalRepository(db),
    backtestRuns: new SqliteBacktestRunRepository(db),
    close: () => db.close(),
  };
}

/**
 * Macro observation repository — stores time series values fetched from
 * macro data sources (currently FRED). Missing observations are stored as
 * SQL NULL, never coerced to 0 or interpolated silently.
 */
import type { DatabaseSync } from "node:sqlite";

export interface MacroObservationRecord {
  readonly seriesId: string;
  readonly dateMs: number;
  readonly value: number | null;
  readonly fetchedAtMs: number;
  readonly sourceId: string;
}

export interface MacroObservationRepository {
  upsertMany(records: readonly MacroObservationRecord[]): Promise<void>;
  seriesHistory(seriesId: string, limit?: number): Promise<readonly MacroObservationRecord[]>;
}

export class SqliteMacroObservationRepository implements MacroObservationRepository {
  constructor(private readonly db: DatabaseSync) {}

  async upsertMany(records: readonly MacroObservationRecord[]): Promise<void> {
    if (records.length === 0) return;
    const stmt = this.db.prepare(
      `INSERT INTO macro_observations (series_id, date_ms, value, fetched_at_ms, source_id)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(series_id, date_ms) DO UPDATE SET
         value=excluded.value, fetched_at_ms=excluded.fetched_at_ms, source_id=excluded.source_id`,
    );
    this.db.exec("BEGIN");
    try {
      for (const r of records) {
        stmt.run(r.seriesId, r.dateMs, r.value, r.fetchedAtMs, r.sourceId);
      }
      this.db.exec("COMMIT");
    } catch (err) {
      this.db.exec("ROLLBACK");
      throw err;
    }
  }

  async seriesHistory(seriesId: string, limit = 100): Promise<readonly MacroObservationRecord[]> {
    const rows = this.db
      .prepare("SELECT * FROM macro_observations WHERE series_id = ? ORDER BY date_ms ASC LIMIT ?")
      .all(seriesId, limit) as Record<string, unknown>[];
    return rows.map((row) => ({
      seriesId: String(row.series_id),
      dateMs: Number(row.date_ms),
      value: row.value === null ? null : Number(row.value),
      fetchedAtMs: Number(row.fetched_at_ms),
      sourceId: String(row.source_id),
    }));
  }
}

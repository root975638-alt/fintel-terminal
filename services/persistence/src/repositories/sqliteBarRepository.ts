import { DatabaseSync } from "node:sqlite";
import type { Bar } from "@fintel/domain";
import { epochMillis, type Timeframe } from "@fintel/money-time";
import type { ProvenanceRecord, QualityTag } from "@fintel/provenance";
import { getSourceEntry } from "@fintel/config";
import type { BarQueryOptions, BarRepository } from "./ports.js";

export class SqliteBarRepository implements BarRepository {
  constructor(private readonly db: DatabaseSync) {}

  async upsertMany(bars: readonly Bar[]): Promise<void> {
    if (bars.length === 0) return;
    const stmt = this.db.prepare(
      `INSERT INTO bars (instrument_id, timeframe, bucket_start_ms, open, high, low, close, volume, adjusted,
                          source_id, fetched_at_ms, as_of_ms, quality, quality_note)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(instrument_id, timeframe, bucket_start_ms) DO UPDATE SET
         open=excluded.open, high=excluded.high, low=excluded.low, close=excluded.close, volume=excluded.volume,
         adjusted=excluded.adjusted, source_id=excluded.source_id, fetched_at_ms=excluded.fetched_at_ms,
         as_of_ms=excluded.as_of_ms, quality=excluded.quality, quality_note=excluded.quality_note`,
    );
    this.db.exec("BEGIN");
    try {
      for (const bar of bars) {
        stmt.run(
          bar.instrumentId,
          bar.timeframe,
          bar.bucketStartMs,
          bar.open,
          bar.high,
          bar.low,
          bar.close,
          bar.volume,
          bar.adjusted ? 1 : 0,
          bar.provenance.source.sourceId,
          bar.provenance.fetchedAtMs,
          bar.provenance.asOfMs,
          bar.provenance.quality,
          bar.provenance.note ?? null,
        );
      }
      this.db.exec("COMMIT");
    } catch (err) {
      this.db.exec("ROLLBACK");
      throw err;
    }
  }

  async query(opts: BarQueryOptions): Promise<readonly Bar[]> {
    const clauses = ["instrument_id = ?", "timeframe = ?"];
    const params: unknown[] = [opts.instrumentId, opts.timeframe];
    if (opts.fromMs !== undefined) {
      clauses.push("bucket_start_ms >= ?");
      params.push(opts.fromMs);
    }
    if (opts.toMs !== undefined) {
      clauses.push("bucket_start_ms <= ?");
      params.push(opts.toMs);
    }
    const limitClause = opts.limit !== undefined ? `LIMIT ${Math.max(0, Math.floor(opts.limit))}` : "";
    const sql = `SELECT * FROM bars WHERE ${clauses.join(" AND ")} ORDER BY bucket_start_ms ASC ${limitClause}`;
    const rows = this.db.prepare(sql).all(...params) as Record<string, unknown>[];
    return rows.map(rowToBar);
  }

  async latestBucketStart(instrumentId: string, timeframe: Timeframe): Promise<number | undefined> {
    const row = this.db
      .prepare(
        "SELECT MAX(bucket_start_ms) as max_bucket FROM bars WHERE instrument_id = ? AND timeframe = ?",
      )
      .get(instrumentId, timeframe) as { max_bucket: number | null } | undefined;
    return row?.max_bucket ?? undefined;
  }
}

function rowToBar(row: Record<string, unknown>): Bar {
  const sourceId = String(row.source_id);
  let source;
  try {
    source = getSourceEntry(sourceId);
  } catch {
    source = { sourceId, displayName: sourceId, method: "public-api" as const, url: "", license: "" };
  }
  const provenance: ProvenanceRecord = {
    source,
    fetchedAtMs: Number(row.fetched_at_ms),
    asOfMs: Number(row.as_of_ms),
    quality: row.quality as QualityTag,
    note: row.quality_note ? String(row.quality_note) : undefined,
  };
  return {
    instrumentId: String(row.instrument_id),
    timeframe: String(row.timeframe) as Timeframe,
    bucketStartMs: epochMillis(Number(row.bucket_start_ms)),
    open: String(row.open),
    high: String(row.high),
    low: String(row.low),
    close: String(row.close),
    volume: String(row.volume),
    adjusted: Number(row.adjusted) === 1,
    provenance,
  };
}

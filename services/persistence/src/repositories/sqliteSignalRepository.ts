import { DatabaseSync } from "node:sqlite";
import type { Signal, SignalDirection } from "@fintel/domain";
import { epochMillis } from "@fintel/money-time";
import type { DerivedProvenance, QualityTag } from "@fintel/provenance";
import type { SignalRepository } from "./ports.js";

export class SqliteSignalRepository implements SignalRepository {
  constructor(private readonly db: DatabaseSync) {}

  async insert(signal: Signal): Promise<void> {
    this.db
      .prepare(
        `INSERT INTO signals (signal_id, instrument_id, strategy_id, direction, score, confidence,
                               expected_value, rationale, honesty_label, generated_at_ms, quality, provenance_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(signal_id) DO NOTHING`,
      )
      .run(
        signal.signalId,
        signal.instrumentId,
        signal.strategyId,
        signal.direction,
        signal.score,
        signal.confidence,
        signal.expectedValue ?? null,
        signal.rationale,
        signal.honestyLabel,
        signal.generatedAtMs,
        signal.provenance.quality,
        JSON.stringify(signal.provenance),
      );
  }

  async latestForInstrument(instrumentId: string, limit: number): Promise<readonly Signal[]> {
    const rows = this.db
      .prepare(
        "SELECT * FROM signals WHERE instrument_id = ? ORDER BY generated_at_ms DESC LIMIT ?",
      )
      .all(instrumentId, limit) as Record<string, unknown>[];
    return rows.map(rowToSignal);
  }
}

function rowToSignal(row: Record<string, unknown>): Signal {
  return {
    signalId: String(row.signal_id),
    instrumentId: String(row.instrument_id),
    strategyId: String(row.strategy_id),
    direction: String(row.direction) as SignalDirection,
    score: Number(row.score),
    confidence: Number(row.confidence),
    expectedValue: row.expected_value !== null && row.expected_value !== undefined ? Number(row.expected_value) : undefined,
    rationale: String(row.rationale),
    honestyLabel: String(row.honesty_label) as Signal["honestyLabel"],
    generatedAtMs: epochMillis(Number(row.generated_at_ms)),
    provenance: JSON.parse(String(row.provenance_json)) as DerivedProvenance,
  };
}

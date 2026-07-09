import { DatabaseSync } from "node:sqlite";
import type { Instrument } from "@fintel/domain";
import type { InstrumentRepository } from "./ports.js";

export class SqliteInstrumentRepository implements InstrumentRepository {
  constructor(private readonly db: DatabaseSync) {}

  async upsert(instrument: Instrument): Promise<void> {
    this.db
      .prepare(
        `INSERT INTO instruments (instrument_id, market, symbol, asset_class, display_name, currency, exchange_mic, isin, active)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(instrument_id) DO UPDATE SET
           market=excluded.market, symbol=excluded.symbol, asset_class=excluded.asset_class,
           display_name=excluded.display_name, currency=excluded.currency,
           exchange_mic=excluded.exchange_mic, isin=excluded.isin, active=excluded.active`,
      )
      .run(
        instrument.instrumentId,
        instrument.market,
        instrument.symbol,
        instrument.assetClass,
        instrument.displayName,
        instrument.currency,
        instrument.exchangeMic ?? null,
        instrument.isin ?? null,
        instrument.active ? 1 : 0,
      );
  }

  async findById(instrumentId: string): Promise<Instrument | undefined> {
    const row = this.db.prepare("SELECT * FROM instruments WHERE instrument_id = ?").get(instrumentId) as
      | Record<string, unknown>
      | undefined;
    return row ? rowToInstrument(row) : undefined;
  }

  async list(): Promise<readonly Instrument[]> {
    const rows = this.db.prepare("SELECT * FROM instruments ORDER BY instrument_id").all() as Record<
      string,
      unknown
    >[];
    return rows.map(rowToInstrument);
  }
}

function rowToInstrument(row: Record<string, unknown>): Instrument {
  return {
    instrumentId: String(row.instrument_id),
    market: row.market as Instrument["market"],
    symbol: String(row.symbol),
    assetClass: row.asset_class as Instrument["assetClass"],
    displayName: String(row.display_name),
    currency: String(row.currency),
    exchangeMic: row.exchange_mic ? String(row.exchange_mic) : undefined,
    isin: row.isin ? String(row.isin) : undefined,
    active: Number(row.active) === 1,
  };
}

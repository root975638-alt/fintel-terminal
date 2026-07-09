/**
 * Repository interfaces — the port that market-data/TA/signals/news services
 * depend on. A Postgres/Timescale implementation can be added later behind the
 * same interfaces without touching any consuming code (spec Section 23).
 */
import type { Bar, Instrument, NewsItem, Signal } from "@fintel/domain";
import type { Timeframe } from "@fintel/money-time";

export interface InstrumentRepository {
  upsert(instrument: Instrument): Promise<void>;
  findById(instrumentId: string): Promise<Instrument | undefined>;
  list(): Promise<readonly Instrument[]>;
}

export interface BarQueryOptions {
  readonly instrumentId: string;
  readonly timeframe: Timeframe;
  readonly fromMs?: number | undefined;
  readonly toMs?: number | undefined;
  readonly limit?: number;
}

export interface BarRepository {
  upsertMany(bars: readonly Bar[]): Promise<void>;
  query(opts: BarQueryOptions): Promise<readonly Bar[]>;
  /** Latest bar bucket start for gap-detection purposes. */
  latestBucketStart(instrumentId: string, timeframe: Timeframe): Promise<number | undefined>;
}

export interface NewsRepository {
  upsertMany(items: readonly NewsItem[]): Promise<void>;
  recent(limit: number): Promise<readonly NewsItem[]>;
  forInstrument(instrumentId: string, limit: number): Promise<readonly NewsItem[]>;
}

export interface SignalRepository {
  insert(signal: Signal): Promise<void>;
  latestForInstrument(instrumentId: string, limit: number): Promise<readonly Signal[]>;
}

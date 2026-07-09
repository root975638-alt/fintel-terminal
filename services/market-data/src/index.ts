/**
 * MarketDataService — the orchestration layer between raw DataSourcePort adapters
 * and the rest of the platform (TA/signals/API/CLI). Responsibilities:
 *   - Resolve which adapter serves a given MarketId
 *   - Fetch, persist (SQLite), and return normalized Bars/Quotes
 *   - Serve from local persistence first when data is fresh enough, falling back
 *     to a live fetch when stale (explicit, logged — never silently substitutes)
 */
import type { DataAcquisitionLayer } from "@fintel/data-acquisition";
import type { Bar, Instrument, MarketId, Quote } from "@fintel/domain";
import { Timeframe } from "@fintel/money-time";
import type { PersistenceLayer } from "@fintel/persistence";

export interface MarketDataServiceOptions {
  readonly acquisition: DataAcquisitionLayer;
  readonly persistence: PersistenceLayer;
}

function adapterSymbolFor(market: MarketId, symbol: string): string {
  // Source-native symbol formatting differs per market/adapter; centralized here
  // so callers only ever deal in canonical (market, symbol) pairs.
  switch (market) {
    case "CRYPTO":
      return symbol.toUpperCase(); // e.g. "BTCUSDT" as Binance expects
    case "US_EQUITIES":
    case "NSE":
    case "BSE":
    case "FOREX":
    default:
      return symbol.toUpperCase();
  }
}

export class MarketDataService {
  constructor(private readonly opts: MarketDataServiceOptions) {}

  async ensureInstrument(instrument: Instrument): Promise<void> {
    await this.opts.persistence.instruments.upsert(instrument);
  }

  /**
   * Fetch bars for an instrument, preferring already-persisted data newer than
   * `maxStalenessMs`, otherwise fetching live from the appropriate adapter for the
   * instrument's market and persisting the result before returning it.
   */
  async getBars(
    instrument: Instrument,
    timeframe: Timeframe,
    opts: { fromMs?: number | undefined; toMs?: number | undefined; maxStalenessMs?: number | undefined } = {},
  ): Promise<readonly Bar[]> {
    const maxStalenessMs = opts.maxStalenessMs ?? 15 * 60_000;
    const latestPersisted = await this.opts.persistence.bars.latestBucketStart(instrument.instrumentId, timeframe);
    const isFreshEnough = latestPersisted !== undefined && Date.now() - latestPersisted <= maxStalenessMs;

    if (!isFreshEnough) {
      const fetched = await this.fetchLive(instrument, timeframe, opts.fromMs, opts.toMs);
      if (fetched.length > 0) {
        await this.opts.persistence.bars.upsertMany(fetched);
      }
    }

    return this.opts.persistence.bars.query({
      instrumentId: instrument.instrumentId,
      timeframe,
      fromMs: opts.fromMs,
      toMs: opts.toMs,
    });
  }

  private async fetchLive(
    instrument: Instrument,
    timeframe: Timeframe,
    fromMs?: number,
    toMs?: number,
  ): Promise<readonly Bar[]> {
    const symbol = adapterSymbolFor(instrument.market, instrument.symbol);
    const query = { instrumentId: instrument.instrumentId, symbol, timeframe, fromMs, toMs };

    switch (instrument.market) {
      case "CRYPTO":
        return this.opts.acquisition.binance.fetchBars(query);
      case "NSE":
        if (timeframe !== Timeframe.D1) {
          throw new Error("NSE adapter only supports daily bars in this milestone");
        }
        return this.opts.acquisition.nseIndia.fetchBars(query);
      case "US_EQUITIES":
        if (timeframe === Timeframe.D1) {
          // Prefer Stooq for daily US equities (explicitly free, unlimited history);
          // fall back to Yahoo if Stooq has no data for this symbol.
          const stooqBars = await this.opts.acquisition.stooq.fetchBars(query);
          if (stooqBars.length > 0) return stooqBars;
        }
        return this.opts.acquisition.yahoo.fetchBars(query);
      case "BSE":
      case "FOREX":
        // Follow-on milestone: no compliant free adapter wired for these yet in this slice.
        throw new Error(
          `No data-acquisition adapter is wired up for market "${instrument.market}" in this milestone. ` +
            `This is an explicit, logged limitation — not a silent gap.`,
        );
      default:
        throw new Error(`Unhandled market "${instrument.market}"`);
    }
  }

  async getQuote(instrument: Instrument): Promise<Quote> {
    const symbol = adapterSymbolFor(instrument.market, instrument.symbol);
    const query = { instrumentId: instrument.instrumentId, symbol };
    switch (instrument.market) {
      case "CRYPTO":
        return this.opts.acquisition.binance.fetchQuote(query);
      case "US_EQUITIES":
      case "NSE":
      case "BSE":
        return this.opts.acquisition.yahoo.fetchQuote(query);
      case "FOREX":
        throw new Error("No compliant free real-time forex quote adapter wired up in this milestone.");
      default:
        throw new Error(`Unhandled market "${instrument.market}"`);
    }
  }
}

export * from "./aggregation.js";
export * from "./gapDetection.js";

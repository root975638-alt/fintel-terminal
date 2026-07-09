/**
 * Binance public market-data adapter — uses the explicitly public, unauthenticated
 * REST endpoints Binance documents for general market-data consumption (no API key,
 * no account, no order execution — pure read-only market data).
 */
import { PoliteFetcher } from "@fintel/compliance";
import { getSourceEntry } from "@fintel/config";
import type { Bar, Quote } from "@fintel/domain";
import { Timeframe, epochMillis } from "@fintel/money-time";
import type { ProvenanceRecord } from "@fintel/provenance";
import type { BarQuery, MarketDataSourcePort, QuoteQuery } from "../ports.js";

const SOURCE_ID = "binance-public-rest";

const TIMEFRAME_TO_BINANCE_INTERVAL: Record<Timeframe, string> = {
  [Timeframe.M1]: "1m",
  [Timeframe.M5]: "5m",
  [Timeframe.M15]: "15m",
  [Timeframe.M30]: "30m",
  [Timeframe.H1]: "1h",
  [Timeframe.H4]: "4h",
  [Timeframe.D1]: "1d",
  [Timeframe.W1]: "1w",
  [Timeframe.MN1]: "1M",
};

// Binance kline array shape: [openTime, open, high, low, close, volume, closeTime, ...]
type BinanceKline = [number, string, string, string, string, string, number, ...unknown[]];

interface BinanceTickerResponse {
  symbol: string;
  lastPrice: string;
  bidPrice: string;
  askPrice: string;
  openPrice: string;
  highPrice: string;
  lowPrice: string;
  prevClosePrice: string;
  volume: string;
}

export class BinanceAdapter implements MarketDataSourcePort {
  readonly sourceId = SOURCE_ID;

  constructor(private readonly fetcher: PoliteFetcher) {}

  async fetchBars(query: BarQuery): Promise<readonly Bar[]> {
    const source = getSourceEntry(SOURCE_ID);
    const interval = TIMEFRAME_TO_BINANCE_INTERVAL[query.timeframe];
    const params = new URLSearchParams({ symbol: query.symbol, interval, limit: "1000" });
    if (query.fromMs !== undefined) params.set("startTime", String(query.fromMs));
    if (query.toMs !== undefined) params.set("endTime", String(query.toMs));

    const url = `https://api.binance.com/api/v3/klines?${params.toString()}`;
    const { data, fetchedAtMs } = await this.fetcher.fetchJson<BinanceKline[]>(url, source, { cacheTtlMs: 30_000 });

    const provenance: ProvenanceRecord = {
      source,
      fetchedAtMs,
      asOfMs: fetchedAtMs,
      quality: "realtime", // Binance public REST reflects live exchange state at request time
    };

    return data.map((k) => ({
      instrumentId: query.instrumentId,
      timeframe: query.timeframe,
      bucketStartMs: epochMillis(k[0]),
      open: k[1],
      high: k[2],
      low: k[3],
      close: k[4],
      volume: k[5],
      adjusted: false, // crypto: no splits/dividends; "adjusted" is not meaningful, always raw
      provenance,
    }));
  }

  async fetchQuote(query: QuoteQuery): Promise<Quote> {
    const source = getSourceEntry(SOURCE_ID);
    const url = `https://api.binance.com/api/v3/ticker/24hr?symbol=${encodeURIComponent(query.symbol)}`;
    const { data, fetchedAtMs } = await this.fetcher.fetchJson<BinanceTickerResponse>(url, source, {
      cacheTtlMs: 5_000,
    });

    const provenance: ProvenanceRecord = { source, fetchedAtMs, asOfMs: fetchedAtMs, quality: "realtime" };

    return {
      instrumentId: query.instrumentId,
      tsMs: epochMillis(fetchedAtMs),
      last: data.lastPrice,
      bid: data.bidPrice,
      ask: data.askPrice,
      dayOpen: data.openPrice,
      dayHigh: data.highPrice,
      dayLow: data.lowPrice,
      previousClose: data.prevClosePrice,
      volume: data.volume,
      provenance,
    };
  }
}

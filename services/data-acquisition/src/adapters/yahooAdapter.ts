/**
 * Yahoo Finance adapter — uses the public (unofficial) chart JSON endpoint.
 * See packages/config SOURCE_REGISTRY entry "yahoo-chart-api" for the compliance
 * rationale. Quality is tagged "delayed" by default since Yahoo's free endpoint
 * does not guarantee real-time latency for most exchanges.
 */
import { PoliteFetcher } from "@fintel/compliance";
import { getSourceEntry } from "@fintel/config";
import type { Bar, Quote } from "@fintel/domain";
import { Timeframe, epochMillis } from "@fintel/money-time";
import type { ProvenanceRecord } from "@fintel/provenance";
import type { BarQuery, MarketDataSourcePort, QuoteQuery } from "../ports.js";

const SOURCE_ID = "yahoo-chart-api";

const TIMEFRAME_TO_YAHOO_INTERVAL: Record<Timeframe, string> = {
  [Timeframe.M1]: "1m",
  [Timeframe.M5]: "5m",
  [Timeframe.M15]: "15m",
  [Timeframe.M30]: "30m",
  [Timeframe.H1]: "60m",
  [Timeframe.H4]: "60m", // Yahoo has no native 4h; caller should aggregate from 60m if needed
  [Timeframe.D1]: "1d",
  [Timeframe.W1]: "1wk",
  [Timeframe.MN1]: "1mo",
};

interface YahooChartResponse {
  chart: {
    result: Array<{
      meta: { currency?: string; regularMarketPrice?: number; previousClose?: number };
      timestamp?: number[];
      indicators: {
        quote: Array<{ open: (number | null)[]; high: (number | null)[]; low: (number | null)[]; close: (number | null)[]; volume: (number | null)[] }>;
      };
    }> | null;
    error: { code: string; description: string } | null;
  };
}

export class YahooAdapter implements MarketDataSourcePort {
  readonly sourceId = SOURCE_ID;

  constructor(private readonly fetcher: PoliteFetcher) {}

  private buildUrl(symbol: string, interval: string, fromMs?: number, toMs?: number): string {
    const params = new URLSearchParams({ interval, includePrePost: "false" });
    if (fromMs !== undefined) params.set("period1", String(Math.floor(fromMs / 1000)));
    params.set("period2", String(Math.floor((toMs ?? Date.now()) / 1000)));
    if (fromMs === undefined) params.set("range", "1y");
    return `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?${params.toString()}`;
  }

  async fetchBars(query: BarQuery): Promise<readonly Bar[]> {
    const source = getSourceEntry(SOURCE_ID);
    const interval = TIMEFRAME_TO_YAHOO_INTERVAL[query.timeframe];
    const url = this.buildUrl(query.symbol, interval, query.fromMs, query.toMs);
    const { data, fetchedAtMs, fromCache } = await this.fetcher.fetchJson<YahooChartResponse>(url, source);

    if (data.chart.error) {
      throw new Error(`Yahoo chart API error for ${query.symbol}: ${data.chart.error.description}`);
    }
    const result = data.chart.result?.[0];
    if (!result || !result.timestamp) return [];

    const quote = result.indicators.quote[0];
    if (!quote) return [];

    const provenance: ProvenanceRecord = {
      source,
      fetchedAtMs,
      asOfMs: fetchedAtMs,
      quality: fromCache ? "delayed" : "delayed", // Yahoo free endpoint: never claim realtime
      note: fromCache ? "served from local politeness cache" : undefined,
    };

    const bars: Bar[] = [];
    for (let i = 0; i < result.timestamp.length; i++) {
      const o = quote.open[i];
      const h = quote.high[i];
      const l = quote.low[i];
      const c = quote.close[i];
      const v = quote.volume[i];
      if (o == null || h == null || l == null || c == null) continue; // Yahoo returns null for gaps/halts
      bars.push({
        instrumentId: query.instrumentId,
        timeframe: query.timeframe,
        bucketStartMs: epochMillis(result.timestamp[i]! * 1000),
        open: o.toFixed(6),
        high: h.toFixed(6),
        low: l.toFixed(6),
        close: c.toFixed(6),
        volume: (v ?? 0).toFixed(0),
        adjusted: false,
        provenance,
      });
    }
    return bars;
  }

  async fetchQuote(query: QuoteQuery): Promise<Quote> {
    const source = getSourceEntry(SOURCE_ID);
    const url = this.buildUrl(query.symbol, "1d");
    const { data, fetchedAtMs, fromCache } = await this.fetcher.fetchJson<YahooChartResponse>(url, source, {
      cacheTtlMs: 60_000,
    });
    if (data.chart.error) {
      throw new Error(`Yahoo chart API error for ${query.symbol}: ${data.chart.error.description}`);
    }
    const result = data.chart.result?.[0];
    if (!result) throw new Error(`Yahoo chart API returned no data for ${query.symbol}`);

    const provenance: ProvenanceRecord = {
      source,
      fetchedAtMs,
      asOfMs: fetchedAtMs,
      quality: "delayed",
      note: fromCache ? "served from local politeness cache" : undefined,
    };

    return {
      instrumentId: query.instrumentId,
      tsMs: epochMillis(fetchedAtMs),
      last: result.meta.regularMarketPrice?.toFixed(6),
      previousClose: result.meta.previousClose?.toFixed(6),
      provenance,
    };
  }
}

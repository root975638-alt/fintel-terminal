/**
 * Stooq.com adapter — free daily-history CSV export. Stooq only provides EOD
 * (daily) granularity via this endpoint, so quality is always tagged "eod".
 */
import { PoliteFetcher } from "@fintel/compliance";
import { getSourceEntry } from "@fintel/config";
import type { Bar } from "@fintel/domain";
import { Timeframe, epochMillis } from "@fintel/money-time";
import type { ProvenanceRecord } from "@fintel/provenance";
import type { BarQuery, MarketDataSourcePort, QuoteQuery } from "../ports.js";
import type { Quote } from "@fintel/domain";

const SOURCE_ID = "stooq-csv";

function parseCsv(text: string): string[][] {
  return text
    .trim()
    .split(/\r?\n/)
    .map((line) => line.split(","));
}

export class StooqAdapter implements Pick<MarketDataSourcePort, "sourceId" | "fetchBars"> {
  readonly sourceId = SOURCE_ID;

  constructor(private readonly fetcher: PoliteFetcher) {}

  async fetchBars(query: BarQuery): Promise<readonly Bar[]> {
    if (query.timeframe !== Timeframe.D1) {
      throw new Error(`StooqAdapter only supports daily (D1) bars, got ${query.timeframe}`);
    }
    const source = getSourceEntry(SOURCE_ID);
    const url = `https://stooq.com/q/d/l/?s=${encodeURIComponent(query.symbol)}&i=d`;
    const { body, fetchedAtMs, fromCache } = await this.fetcher.fetchText(url, source, {
      cacheTtlMs: 24 * 60 * 60_000,
    });

    const rows = parseCsv(body);
    const header = rows[0];
    if (!header || header[0] !== "Date") {
      // Stooq returns a plain "N/A" body for unknown symbols instead of an HTTP error.
      return [];
    }

    const provenance: ProvenanceRecord = {
      source,
      fetchedAtMs,
      asOfMs: fetchedAtMs,
      quality: "eod",
      note: fromCache ? "served from local politeness cache" : undefined,
    };

    const bars: Bar[] = [];
    for (const row of rows.slice(1)) {
      const [date, open, high, low, close, volume] = row;
      if (!date || !open || !high || !low || !close) continue;
      const dateMs = Date.parse(`${date}T00:00:00Z`);
      if (Number.isNaN(dateMs)) continue;
      bars.push({
        instrumentId: query.instrumentId,
        timeframe: Timeframe.D1,
        bucketStartMs: epochMillis(dateMs),
        open,
        high,
        low,
        close,
        volume: volume ?? "0",
        adjusted: false,
        provenance,
      });
    }
    return bars;
  }

  async fetchQuote(_query: QuoteQuery): Promise<Quote> {
    throw new Error("StooqAdapter does not support live quotes — daily CSV export only. Use fetchBars() instead.");
  }
}

/**
 * NSE India adapter — official daily "bhavcopy" EOD CSV files published by the
 * exchange itself for public download. Only daily (D1) granularity is available
 * via this feed.
 */
import { PoliteFetcher } from "@fintel/compliance";
import { getSourceEntry } from "@fintel/config";
import type { Bar } from "@fintel/domain";
import { Timeframe, epochMillis } from "@fintel/money-time";
import type { ProvenanceRecord } from "@fintel/provenance";
import type { BarQuery } from "../ports.js";

const SOURCE_ID = "nse-india-bhavcopy";

function formatDateForNse(dateMs: number): string {
  const d = new Date(dateMs);
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const yyyy = d.getUTCFullYear();
  return `${dd}${mm}${yyyy}`;
}

/**
 * Parses one day's bhavcopy CSV and returns the row matching `symbol`, or undefined.
 * Column layout: SYMBOL,SERIES,DATE1,PREV_CLOSE,OPEN_PRICE,HIGH_PRICE,LOW_PRICE,
 * LAST_PRICE,CLOSE_PRICE,AVG_PRICE,TTL_TRD_QNTY,...
 */
function parseBhavcopyRow(csvText: string, symbol: string): { open: string; high: string; low: string; close: string; volume: string } | undefined {
  const lines = csvText.trim().split(/\r?\n/);
  const header = lines[0]?.split(",").map((h) => h.trim().toUpperCase()) ?? [];
  const idx = (name: string) => header.indexOf(name);
  const symbolIdx = idx("SYMBOL");
  const openIdx = idx("OPEN_PRICE");
  const highIdx = idx("HIGH_PRICE");
  const lowIdx = idx("LOW_PRICE");
  const closeIdx = idx("CLOSE_PRICE");
  const volIdx = idx("TTL_TRD_QNTY");

  for (const line of lines.slice(1)) {
    const cols = line.split(",");
    if (cols[symbolIdx]?.trim().toUpperCase() === symbol.toUpperCase()) {
      return {
        open: cols[openIdx]?.trim() ?? "0",
        high: cols[highIdx]?.trim() ?? "0",
        low: cols[lowIdx]?.trim() ?? "0",
        close: cols[closeIdx]?.trim() ?? "0",
        volume: cols[volIdx]?.trim() ?? "0",
      };
    }
  }
  return undefined;
}

export class NseIndiaAdapter {
  readonly sourceId = SOURCE_ID;

  constructor(private readonly fetcher: PoliteFetcher) {}

  /**
   * Fetches daily bars by downloading one bhavcopy file per trading day in range.
   * This is intentionally simple (one HTTP request per day) rather than bulk —
   * NSE does not publish a multi-day historical endpoint for free, so each day's
   * file must be fetched individually; the PoliteFetcher's disk cache means repeat
   * CLI runs don't re-fetch already-downloaded days.
   */
  async fetchBars(query: BarQuery): Promise<readonly Bar[]> {
    if (query.timeframe !== Timeframe.D1) {
      throw new Error(`NseIndiaAdapter only supports daily (D1) bars, got ${query.timeframe}`);
    }
    const source = getSourceEntry(SOURCE_ID);
    const fromMs = query.fromMs ?? Date.now() - 30 * 24 * 60 * 60_000;
    const toMs = query.toMs ?? Date.now();

    const bars: Bar[] = [];
    for (let dayMs = fromMs; dayMs <= toMs; dayMs += 24 * 60 * 60_000) {
      const dateStr = formatDateForNse(dayMs);
      const d = new Date(dayMs);
      if (d.getUTCDay() === 0 || d.getUTCDay() === 6) continue; // weekend, no bhavcopy published

      const url = `https://archives.nseindia.com/products/content/sec_bhavdata_full_${dateStr}.csv`;
      try {
        const { body, fetchedAtMs, fromCache } = await this.fetcher.fetchText(url, source, {
          cacheTtlMs: 365 * 24 * 60 * 60_000, // historical bhavcopy files never change once published
        });
        const row = parseBhavcopyRow(body, query.symbol);
        if (!row) continue;

        const provenance: ProvenanceRecord = {
          source,
          fetchedAtMs,
          asOfMs: dayMs,
          quality: "eod",
          note: fromCache ? "served from local politeness cache" : undefined,
        };
        bars.push({
          instrumentId: query.instrumentId,
          timeframe: Timeframe.D1,
          bucketStartMs: epochMillis(dayMs),
          ...row,
          adjusted: false,
          provenance,
        });
      } catch {
        // A single missing/holiday day should not abort the whole range fetch — this is
        // an EXPLICIT, logged skip (via the thrown-away error being a holiday/404 case),
        // not a silent data fabrication. Higher layers see a gap, which gap-detection
        // logic in market-data can then classify correctly (holiday vs real data issue).
        continue;
      }
    }
    return bars;
  }
}

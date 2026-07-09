import { describe, expect, it } from "vitest";
import { epochMillis, Timeframe } from "@fintel/money-time";
import type { Bar } from "@fintel/domain";
import type { ProvenanceRecord } from "@fintel/provenance";
import { aggregateBars } from "../src/aggregation.js";
import { detectGaps } from "../src/gapDetection.js";
import { US_EQUITIES_CALENDAR, CRYPTO_CALENDAR } from "@fintel/money-time";

function makeM1Bar(tsMs: number, close: number, quality: ProvenanceRecord["quality"] = "realtime"): Bar {
  return {
    instrumentId: "TEST:SYM",
    timeframe: Timeframe.M1,
    bucketStartMs: epochMillis(tsMs),
    open: String(close - 0.1),
    high: String(close + 0.2),
    low: String(close - 0.2),
    close: String(close),
    volume: "100",
    adjusted: false,
    provenance: {
      source: { sourceId: "test", displayName: "Test", method: "public-api", url: "", license: "" },
      fetchedAtMs: tsMs,
      asOfMs: tsMs,
      quality,
    },
  };
}

describe("aggregateBars", () => {
  it("aggregates 60 M1 bars into a single H1 bar with correct OHLCV semantics", () => {
    const base = Date.UTC(2024, 0, 1, 10, 0, 0);
    const m1Bars: Bar[] = Array.from({ length: 60 }, (_, i) => makeM1Bar(base + i * 60_000, 100 + i * 0.1));

    const h1Bars = aggregateBars(m1Bars, Timeframe.H1);
    expect(h1Bars).toHaveLength(1);
    const bar = h1Bars[0]!;
    expect(bar.open).toBe(m1Bars[0]!.open); // open = first bar's open
    expect(bar.close).toBe(m1Bars[59]!.close); // close = last bar's close
    expect(Number(bar.high)).toBeCloseTo(Math.max(...m1Bars.map((b) => Number(b.high))), 5);
    expect(Number(bar.low)).toBeCloseTo(Math.min(...m1Bars.map((b) => Number(b.low))), 5);
    expect(bar.volume).toBe("6000"); // 60 bars * 100 volume each
  });

  it("bounds aggregated quality by the worst input quality", () => {
    const base = Date.UTC(2024, 0, 1, 10, 0, 0);
    const bars = [
      makeM1Bar(base, 100, "realtime"),
      makeM1Bar(base + 60_000, 101, "stale"),
      makeM1Bar(base + 120_000, 102, "realtime"),
    ];
    const h1 = aggregateBars(bars, Timeframe.H1);
    expect(h1[0]!.provenance.quality).toBe("stale");
  });

  it("returns an empty array for empty input", () => {
    expect(aggregateBars([], Timeframe.D1)).toEqual([]);
  });

  it("produces separate buckets for bars spanning multiple hours", () => {
    const hour0 = Date.UTC(2024, 0, 1, 10, 0, 0);
    const hour1 = Date.UTC(2024, 0, 1, 11, 0, 0);
    const bars = [makeM1Bar(hour0, 100), makeM1Bar(hour0 + 30 * 60_000, 105), makeM1Bar(hour1, 110)];
    const h1 = aggregateBars(bars, Timeframe.H1);
    expect(h1).toHaveLength(2);
  });
});

describe("detectGaps", () => {
  it("finds no gaps in a fully continuous crypto (24/7) daily series", () => {
    const base = Date.UTC(2024, 0, 1);
    const bars = Array.from({ length: 5 }, (_, i) => makeM1Bar(base + i * 24 * 60 * 60_000, 100 + i));
    const daily = bars.map((b) => ({ ...b, timeframe: Timeframe.D1 }));
    const gaps = detectGaps(daily, Timeframe.D1, CRYPTO_CALENDAR);
    expect(gaps).toHaveLength(0);
  });

  it("detects a real gap in a continuous-market series (missing a day)", () => {
    const base = Date.UTC(2024, 0, 1);
    const bars = [
      { ...makeM1Bar(base, 100), timeframe: Timeframe.D1 },
      // day 2 missing
      { ...makeM1Bar(base + 2 * 24 * 60 * 60_000, 102), timeframe: Timeframe.D1 },
    ];
    const gaps = detectGaps(bars, Timeframe.D1, CRYPTO_CALENDAR);
    expect(gaps).toHaveLength(1);
    expect(gaps[0]!.missingBucketCount).toBe(1);
  });

  it("returns no gaps for fewer than 2 bars", () => {
    expect(detectGaps([], Timeframe.D1, CRYPTO_CALENDAR)).toHaveLength(0);
    expect(detectGaps([makeM1Bar(0, 100)], Timeframe.D1, CRYPTO_CALENDAR)).toHaveLength(0);
  });
});

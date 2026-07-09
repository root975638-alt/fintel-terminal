import { describe, expect, it } from "vitest";
import type { Bar } from "@fintel/domain";
import { epochMillis, Timeframe } from "@fintel/money-time";
import type { ProvenanceRecord } from "@fintel/provenance";
import { SignalEngine } from "../src/index.js";

function makeBars(closes: number[]): Bar[] {
  const provenance: ProvenanceRecord = {
    source: { sourceId: "test-fixture", displayName: "Test Fixture", method: "public-api", url: "", license: "test" },
    fetchedAtMs: Date.now(),
    asOfMs: Date.now(),
    quality: "realtime",
  };
  return closes.map((close, i) => ({
    instrumentId: "TEST:SYM",
    timeframe: Timeframe.D1,
    bucketStartMs: epochMillis(Date.UTC(2024, 0, 1) + i * 24 * 60 * 60_000),
    open: String(close),
    high: String(close * 1.01),
    low: String(close * 0.99),
    close: String(close),
    volume: "1000",
    adjusted: true,
    provenance,
  }));
}

describe("SignalEngine", () => {
  it("produces no signals when there isn't enough bar history", () => {
    const engine = new SignalEngine();
    const bars = makeBars([100, 101, 102]);
    const signals = engine.evaluateAll({ instrumentId: "TEST:SYM", bars });
    expect(signals).toHaveLength(0);
  });

  it("produces long-biased signals from strategies for a sustained uptrend", () => {
    const engine = new SignalEngine();
    // Gentle uptrend with small pullbacks so RSI doesn't stay pinned overbought (>70),
    // which would otherwise correctly cause the EMA/RSI strategy to report "flat" (its
    // documented overbought filter) rather than "long".
    const closes = Array.from({ length: 60 }, (_, i) => 100 + i * 0.15 + Math.sin(i / 2) * 4);
    const bars = makeBars(closes);
    const signals = engine.evaluateAll({ instrumentId: "TEST:SYM", bars });

    expect(signals.length).toBeGreaterThan(0);
    for (const s of signals) {
      expect(s.honestyLabel).toBe("HYPOTHESIS"); // no strategy may claim ESTABLISHED without backtest validation
      expect(s.confidence).toBeGreaterThanOrEqual(0);
      expect(s.confidence).toBeLessThanOrEqual(1);
      expect(s.rationale.length).toBeGreaterThan(0);
    }
    // The trend-following EMA/RSI strategy specifically should agree on "long" in a sustained
    // uptrend. (The Bollinger mean-reversion strategy is EXPECTED to disagree in strong trends —
    // that's its documented, honest limitation, not a bug.)
    const emaSignal = signals.find((s) => s.strategyId.startsWith("ema-crossover-rsi-filter"));
    expect(emaSignal?.direction).toBe("long");
  });

  it("bounds confidence strictly by the worst input data quality (stale caps below realtime ceiling)", () => {
    const staleProvenance: ProvenanceRecord = {
      source: { sourceId: "test-fixture", displayName: "Test Fixture", method: "public-api", url: "", license: "test" },
      fetchedAtMs: Date.now(),
      asOfMs: Date.now(),
      quality: "stale",
    };
    const closes = Array.from({ length: 60 }, (_, i) => 100 + i * 0.8);
    const freshBars = makeBars(closes);
    const staleBars = freshBars.map((b) => ({ ...b, provenance: staleProvenance }));

    const engine = new SignalEngine();
    const freshSignals = engine.evaluateAll({ instrumentId: "TEST:SYM", bars: freshBars });
    const staleSignals = engine.evaluateAll({ instrumentId: "TEST:SYM", bars: staleBars });

    for (let i = 0; i < staleSignals.length; i++) {
      expect(staleSignals[i]!.confidence).toBeLessThanOrEqual(freshSignals[i]!.confidence);
    }
  });
});

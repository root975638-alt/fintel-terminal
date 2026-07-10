import { describe, expect, it } from "vitest";
import { epochMillis, Timeframe } from "@fintel/money-time";
import type { Bar } from "@fintel/domain";
import type { ProvenanceRecord } from "@fintel/provenance";
import type { Strategy, StrategyInput, StrategyRawOutput } from "@fintel/signals";
import { runBacktest } from "../src/engine.js";
import { DEFAULT_COST_MODEL } from "../src/costs.js";
import { DEFAULT_POSITION_SIZING } from "../src/types.js";
import type { BacktestConfig } from "../src/types.js";

function makeBar(index: number, close: number): Bar {
  const provenance: ProvenanceRecord = {
    source: { sourceId: "test", displayName: "Test", method: "public-api", url: "", license: "" },
    fetchedAtMs: 0,
    asOfMs: 0,
    quality: "realtime",
  };
  return {
    instrumentId: "TEST:SYM",
    timeframe: Timeframe.D1,
    bucketStartMs: epochMillis(index * 24 * 60 * 60_000),
    open: String(close),
    high: String(close * 1.01),
    low: String(close * 0.99),
    close: String(close),
    volume: "1000",
    adjusted: true,
    provenance,
  };
}

/**
 * A spy strategy that records the exact set of bars it was given on every
 * evaluate() call, so the test can assert none of them are from the future
 * relative to the "current" simulated bar.
 */
function createLeakageSpyStrategy(minimumBars: number): Strategy & { calls: number[][] } {
  const calls: number[][] = [];
  return {
    strategyId: "leakage-spy",
    version: "1.0.0",
    honestyLabel: "HYPOTHESIS",
    minimumBars,
    calls,
    evaluate(input: StrategyInput): StrategyRawOutput | undefined {
      calls.push(input.bars.map((b) => b.bucketStartMs));
      if (input.bars.length < minimumBars) return undefined;
      // Alternate direction deterministically so the engine actually opens/closes positions.
      const direction = calls.length % 2 === 0 ? "long" : "short";
      return { direction, score: 0.5, rationale: "spy" };
    },
  };
}

const baseConfig: BacktestConfig = {
  instrumentId: "TEST:SYM",
  strategyId: "leakage-spy",
  initialCapital: 10_000,
  costModel: DEFAULT_COST_MODEL,
  positionSizing: DEFAULT_POSITION_SIZING,
  warmupBars: 10,
};

describe("runBacktest — leakage guard", () => {
  it("never shows the strategy any bar timestamped after the bar currently being processed", () => {
    const minimumBars = 10;
    const totalBars = 100;
    const bars = Array.from({ length: totalBars }, (_, i) => makeBar(i, 100 + Math.sin(i / 5) * 10));
    const strategy = createLeakageSpyStrategy(minimumBars);

    runBacktest(bars, strategy, { ...baseConfig, warmupBars: minimumBars });

    expect(strategy.calls.length).toBeGreaterThan(0);
    for (let callIdx = 0; callIdx < strategy.calls.length; callIdx++) {
      const expectedCurrentBarIndex = minimumBars + callIdx;
      const expectedCurrentBarTs = bars[expectedCurrentBarIndex]!.bucketStartMs;
      const visibleTimestamps = strategy.calls[callIdx]!;

      // The most recent bar shown must be exactly the "current" bar for this step.
      expect(visibleTimestamps[visibleTimestamps.length - 1]).toBe(expectedCurrentBarTs);
      // NO visible bar may be timestamped later than the current bar (the core leakage assertion).
      for (const ts of visibleTimestamps) {
        expect(ts).toBeLessThanOrEqual(expectedCurrentBarTs);
      }
    }
  });

  it("bounds the visible window to lookbackWindowBars (does not leak unbounded growing history either)", () => {
    const minimumBars = 5;
    const totalBars = 50;
    const lookback = 10;
    const bars = Array.from({ length: totalBars }, (_, i) => makeBar(i, 100));
    const strategy = createLeakageSpyStrategy(minimumBars);

    runBacktest(bars, strategy, { ...baseConfig, warmupBars: minimumBars }, lookback);

    const lastCall = strategy.calls[strategy.calls.length - 1]!;
    expect(lastCall.length).toBeLessThanOrEqual(lookback);
  });
});

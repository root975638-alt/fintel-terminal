import { describe, expect, it } from "vitest";
import { epochMillis, Timeframe } from "@fintel/money-time";
import type { Bar } from "@fintel/domain";
import type { ProvenanceRecord } from "@fintel/provenance";
import type { Strategy, StrategyInput, StrategyRawOutput } from "@fintel/signals";
import { runBacktest } from "../src/engine.js";
import { runWalkForwardBacktest, DEFAULT_WALK_FORWARD_CONFIG } from "../src/walkForward.js";
import { DEFAULT_COST_MODEL } from "../src/costs.js";
import { DEFAULT_POSITION_SIZING, type BacktestConfig } from "../src/types.js";

function makeBar(index: number, close: number): Bar {
  const provenance: ProvenanceRecord = {
    source: { sourceId: "test", displayName: "Test", method: "public-api", url: "", license: "" },
    fetchedAtMs: 0,
    asOfMs: index * 24 * 60 * 60_000,
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

/** A trivial strategy: always long once warmed up. Used to test trade mechanics deterministically. */
function createAlwaysLongStrategy(minimumBars: number): Strategy {
  return {
    strategyId: "always-long",
    version: "1.0.0",
    honestyLabel: "HYPOTHESIS",
    minimumBars,
    evaluate(input: StrategyInput): StrategyRawOutput | undefined {
      if (input.bars.length < minimumBars) return undefined;
      return { direction: "long", score: 1, rationale: "always long" };
    },
  };
}

/** Flips direction every bar once warmed up — generates many trades to exercise the reversal path. */
function createAlternatingStrategy(minimumBars: number): Strategy {
  let calls = 0;
  return {
    strategyId: "alternating",
    version: "1.0.0",
    honestyLabel: "HYPOTHESIS",
    minimumBars,
    evaluate(input: StrategyInput): StrategyRawOutput | undefined {
      if (input.bars.length < minimumBars) return undefined;
      calls += 1;
      return { direction: calls % 2 === 0 ? "long" : "short", score: 0.5, rationale: "alternating" };
    },
  };
}

const baseConfig: BacktestConfig = {
  instrumentId: "TEST:SYM",
  strategyId: "test",
  initialCapital: 10_000,
  costModel: DEFAULT_COST_MODEL,
  positionSizing: DEFAULT_POSITION_SIZING,
  warmupBars: 5,
};

describe("runBacktest — integration", () => {
  it("opens exactly one long position and holds it for a monotonically rising price series", () => {
    const minimumBars = 5;
    // Rising price: 100, 101, 102, ... — always-long strategy should open once and hold until end-of-data close.
    const bars = Array.from({ length: 30 }, (_, i) => makeBar(i, 100 + i));
    const strategy = createAlwaysLongStrategy(minimumBars);

    const result = runBacktest(bars, strategy, { ...baseConfig, warmupBars: minimumBars });

    expect(result.trades).toHaveLength(1); // one continuous long trade, closed at end-of-data
    expect(result.trades[0]!.direction).toBe("long");
    expect(result.trades[0]!.netPnl).toBeGreaterThan(0); // rising price, should be profitable net of costs
    expect(result.equityCurve.length).toBeGreaterThan(0);
    // Final equity should exceed initial capital since price rose the whole time.
    expect(result.equityCurve[result.equityCurve.length - 1]!.equity).toBeGreaterThan(baseConfig.initialCapital);
  });

  it("returns a warning and no trades when there is insufficient history", () => {
    const minimumBars = 20;
    const bars = Array.from({ length: 5 }, (_, i) => makeBar(i, 100));
    const strategy = createAlwaysLongStrategy(minimumBars);

    const result = runBacktest(bars, strategy, { ...baseConfig, warmupBars: minimumBars });
    expect(result.trades).toHaveLength(0);
    expect(result.warnings.some((w) => w.code === "INSUFFICIENT_HISTORY")).toBe(true);
  });

  it("generates multiple round-trip trades for an alternating-direction strategy", () => {
    const minimumBars = 5;
    const bars = Array.from({ length: 40 }, (_, i) => makeBar(i, 100 + Math.sin(i / 3) * 5));
    const strategy = createAlternatingStrategy(minimumBars);

    const result = runBacktest(bars, strategy, { ...baseConfig, warmupBars: minimumBars });
    expect(result.trades.length).toBeGreaterThan(1);
    // Every trade should have non-negative costs (spread+slippage+commission always applied).
    for (const t of result.trades) {
      expect(t.totalCosts).toBeGreaterThan(0);
      expect(t.grossPnl - t.totalCosts).toBeCloseTo(t.netPnl, 8);
    }
  });

  it("applies costs such that net P&L is always worse than gross P&L", () => {
    const minimumBars = 5;
    const bars = Array.from({ length: 30 }, (_, i) => makeBar(i, 100 + i));
    const strategy = createAlwaysLongStrategy(minimumBars);
    const result = runBacktest(bars, strategy, { ...baseConfig, warmupBars: minimumBars });

    for (const t of result.trades) {
      expect(t.netPnl).toBeLessThan(t.grossPnl);
    }
  });
});

describe("runWalkForwardBacktest — integration", () => {
  it("splits bars into IS/OOS segments according to inSampleFraction", () => {
    const minimumBars = 5;
    const bars = Array.from({ length: 100 }, (_, i) => makeBar(i, 100 + i * 0.1));
    const strategy = createAlwaysLongStrategy(minimumBars);

    const report = runWalkForwardBacktest(bars, strategy, { ...baseConfig, warmupBars: minimumBars }, {
      inSampleFraction: 0.6,
    });

    expect(report.inSample.barCount).toBe(60);
    expect(report.outOfSample.barCount).toBe(40);
  });

  it("runs IS and OOS as fully independent backtests (separate starting capital)", () => {
    const minimumBars = 5;
    const bars = Array.from({ length: 100 }, (_, i) => makeBar(i, 100 + i * 0.1));
    const strategy = createAlwaysLongStrategy(minimumBars);
    const config = { ...baseConfig, warmupBars: minimumBars, initialCapital: 5000 };

    const report = runWalkForwardBacktest(bars, strategy, config, DEFAULT_WALK_FORWARD_CONFIG);

    // Both segments should start their equity curve near the SAME initial capital (5000),
    // not one continuing from the other's ending equity.
    expect(report.inSample.run.equityCurve[0]!.equity).toBeCloseTo(5000, 0);
    expect(report.outOfSample.run.equityCurve[0]!.equity).toBeCloseTo(5000, 0);
  });

  it("returns oosHoldsUp=null when OOS has too few trades to judge", () => {
    const minimumBars = 5;
    const bars = Array.from({ length: 20 }, (_, i) => makeBar(i, 100 + i));
    const strategy = createAlwaysLongStrategy(minimumBars);
    const report = runWalkForwardBacktest(bars, strategy, { ...baseConfig, warmupBars: minimumBars });
    expect(report.oosHoldsUp).toBeNull();
  });
});

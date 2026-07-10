import { describe, expect, it } from "vitest";
import { computeMetrics, equityCurveReturns, maxDrawdown } from "../src/metrics.js";
import { DEFAULT_COST_MODEL } from "../src/costs.js";
import type { EquityPoint, SimulatedTrade } from "../src/types.js";

function eq(bucketStartMs: number, equity: number): EquityPoint {
  return { bucketStartMs, equity };
}

describe("equityCurveReturns", () => {
  it("computes simple period returns correctly", () => {
    const curve = [eq(0, 100), eq(1, 110), eq(2, 99)];
    const returns = equityCurveReturns(curve);
    expect(returns[0]).toBeCloseTo(0.1, 10); // 110/100 - 1
    expect(returns[1]).toBeCloseTo(-0.1, 10); // 99/110 - 1
  });
});

describe("maxDrawdown", () => {
  it("computes zero drawdown for a monotonically increasing curve", () => {
    const curve = [eq(0, 100), eq(1, 110), eq(2, 120)];
    expect(maxDrawdown(curve)).toBe(0);
  });

  it("computes the correct peak-to-trough drawdown", () => {
    // Peak at 120, trough at 90 -> drawdown = (120-90)/120 = 0.25
    const curve = [eq(0, 100), eq(1, 120), eq(2, 90), eq(3, 100)];
    expect(maxDrawdown(curve)).toBeCloseTo(0.25, 10);
  });

  it("tracks the worst drawdown across multiple peaks", () => {
    const curve = [eq(0, 100), eq(1, 150), eq(2, 120), eq(3, 200), eq(4, 80)];
    // second drawdown: (200-80)/200 = 0.6, larger than (150-120)/150=0.2
    expect(maxDrawdown(curve)).toBeCloseTo(0.6, 10);
  });
});

function makeTrade(netPnl: number, entryPrice = 100, quantity = 1): SimulatedTrade {
  return {
    direction: "long",
    entryBucketStartMs: 0,
    exitBucketStartMs: 1,
    entryPrice,
    exitPrice: entryPrice + netPnl,
    quantity,
    grossPnl: netPnl,
    totalCosts: 0,
    netPnl,
    netPnlPct: netPnl / (entryPrice * quantity),
    holdingBars: 1,
  };
}

describe("computeMetrics", () => {
  it("computes total return correctly for a simple growth curve", () => {
    const curve = [eq(0, 1000), eq(30 * 24 * 60 * 60_000, 1100)];
    const metrics = computeMetrics([], curve, 1000, DEFAULT_COST_MODEL);
    expect(metrics.totalReturnPct).toBeCloseTo(0.1, 10);
  });

  it("computes win rate and profit factor correctly from known trades", () => {
    const trades = [makeTrade(100), makeTrade(-50), makeTrade(200), makeTrade(-25)];
    const curve = [eq(0, 1000), eq(1, 1225)];
    const metrics = computeMetrics(trades, curve, 1000, DEFAULT_COST_MODEL);
    expect(metrics.winRate).toBeCloseTo(0.5, 10); // 2 wins out of 4
    // grossProfit = 100+200=300, grossLoss = 50+25=75 -> profitFactor = 4
    expect(metrics.profitFactor).toBeCloseTo(4, 10);
    expect(metrics.sampleSize).toBe(4);
  });

  it("computes expectancy as the mean net P&L per trade", () => {
    const trades = [makeTrade(10), makeTrade(-10), makeTrade(20)];
    const curve = [eq(0, 1000), eq(1, 1020)];
    const metrics = computeMetrics(trades, curve, 1000, DEFAULT_COST_MODEL);
    expect(metrics.expectancyPerTrade).toBeCloseTo((10 - 10 + 20) / 3, 10);
  });

  it("returns null for winRate/profitFactor/expectancy when there are zero trades", () => {
    const curve = [eq(0, 1000), eq(1, 1000)];
    const metrics = computeMetrics([], curve, 1000, DEFAULT_COST_MODEL);
    expect(metrics.winRate).toBeNull();
    expect(metrics.profitFactor).toBeNull();
    expect(metrics.expectancyPerTrade).toBeNull();
    expect(metrics.sampleSize).toBe(0);
  });

  it("returns null profitFactor when there are no losing trades (undefined ratio, not Infinity)", () => {
    const trades = [makeTrade(10), makeTrade(20)];
    const curve = [eq(0, 1000), eq(1, 1030)];
    const metrics = computeMetrics(trades, curve, 1000, DEFAULT_COST_MODEL);
    expect(metrics.profitFactor).toBeNull();
  });

  it("returns null cagr for a period shorter than 30 days", () => {
    const curve = [eq(0, 1000), eq(24 * 60 * 60_000, 1010)]; // 1 day
    const metrics = computeMetrics([], curve, 1000, DEFAULT_COST_MODEL);
    expect(metrics.cagr).toBeNull();
  });

  it("computes a sensible CAGR for a known one-year doubling", () => {
    const oneYearMs = 365 * 24 * 60 * 60_000;
    const curve = [eq(0, 1000), eq(oneYearMs, 2000)];
    const metrics = computeMetrics([], curve, 1000, DEFAULT_COST_MODEL);
    expect(metrics.cagr).toBeCloseTo(1.0, 5); // 100% return over exactly 1 year = 100% CAGR
  });

  it("always includes assumptions (risk-free rate, cost model, annualization basis) alongside metrics", () => {
    const curve = [eq(0, 1000), eq(1, 1000)];
    const metrics = computeMetrics([], curve, 1000, DEFAULT_COST_MODEL, { riskFreeRateAnnual: 0.02 });
    expect(metrics.assumptions.riskFreeRateAnnual).toBe(0.02);
    expect(metrics.assumptions.costModel).toEqual(DEFAULT_COST_MODEL);
    expect(metrics.assumptions.periodsPerYearForAnnualization).toBe(252);
  });

  it("returns null Sharpe/Sortino when there are fewer than 2 return observations", () => {
    const curve = [eq(0, 1000)]; // only one point -> zero returns
    const metrics = computeMetrics([], curve, 1000, DEFAULT_COST_MODEL);
    expect(metrics.sharpeRatio).toBeNull();
    expect(metrics.sortinoRatio).toBeNull();
  });
});

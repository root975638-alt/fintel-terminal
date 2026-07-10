/**
 * Backtest performance metrics. Every metric here MUST be reported alongside
 * sample size and period (spec Section 0: "ANY backtest/signal metric MUST
 * report sample size, period, costs assumed, and IS-vs-OOS — never a headline
 * metric alone"). This module computes the numbers; callers (CLI/API/docs) are
 * responsible for always displaying them together with the metadata in
 * `BacktestMetrics.sampleSize`/`periodDays`/`assumptions`.
 */
import type { EquityPoint, SimulatedTrade } from "./types.js";
import type { CostModelConfig } from "./costs.js";

export interface BacktestMetrics {
  readonly totalReturnPct: number;
  readonly cagr: number | null; // null if period is too short to annualize meaningfully
  readonly sharpeRatio: number | null; // null if fewer than 2 return observations (std-dev undefined)
  readonly sortinoRatio: number | null;
  readonly maxDrawdownPct: number;
  readonly winRate: number | null; // null if zero trades
  readonly profitFactor: number | null; // null if zero losing trades (undefined ratio) or zero trades
  readonly expectancyPerTrade: number | null;
  readonly turnover: number;
  readonly sampleSize: number; // number of trades — ALWAYS report this next to any ratio above
  readonly periodDays: number;
  readonly assumptions: {
    readonly riskFreeRateAnnual: number;
    readonly costModel: CostModelConfig;
    readonly periodsPerYearForAnnualization: number;
  };
}

function mean(values: readonly number[]): number {
  return values.length === 0 ? 0 : values.reduce((a, b) => a + b, 0) / values.length;
}

function stdDev(values: readonly number[]): number {
  if (values.length < 2) return 0;
  const m = mean(values);
  const variance = values.reduce((acc, v) => acc + (v - m) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

/** Simple period-over-period returns of an equity curve (equity_t / equity_{t-1} - 1). */
export function equityCurveReturns(equityCurve: readonly EquityPoint[]): number[] {
  const returns: number[] = [];
  for (let i = 1; i < equityCurve.length; i++) {
    const prev = equityCurve[i - 1]!.equity;
    const cur = equityCurve[i]!.equity;
    if (prev !== 0) returns.push(cur / prev - 1);
  }
  return returns;
}

export function maxDrawdown(equityCurve: readonly EquityPoint[]): number {
  let peak = -Infinity;
  let maxDd = 0;
  for (const point of equityCurve) {
    if (point.equity > peak) peak = point.equity;
    if (peak > 0) {
      const dd = (peak - point.equity) / peak;
      if (dd > maxDd) maxDd = dd;
    }
  }
  return maxDd;
}

export interface ComputeMetricsOptions {
  readonly riskFreeRateAnnual?: number;
  readonly periodsPerYearForAnnualization?: number; // e.g. 252 for daily bars, 365 for crypto daily
}

export function computeMetrics(
  trades: readonly SimulatedTrade[],
  equityCurve: readonly EquityPoint[],
  initialCapital: number,
  costModel: CostModelConfig,
  opts: ComputeMetricsOptions = {},
): BacktestMetrics {
  const riskFreeRateAnnual = opts.riskFreeRateAnnual ?? 0;
  const periodsPerYear = opts.periodsPerYearForAnnualization ?? 252;

  const finalEquity = equityCurve.length > 0 ? equityCurve[equityCurve.length - 1]!.equity : initialCapital;
  const totalReturnPct = initialCapital !== 0 ? (finalEquity - initialCapital) / initialCapital : 0;

  const periodDays =
    equityCurve.length >= 2
      ? (equityCurve[equityCurve.length - 1]!.bucketStartMs - equityCurve[0]!.bucketStartMs) / (24 * 60 * 60_000)
      : 0;

  const cagr =
    periodDays >= 30 && initialCapital > 0 && finalEquity > 0
      ? Math.pow(finalEquity / initialCapital, 365 / periodDays) - 1
      : null;

  const returns = equityCurveReturns(equityCurve);
  const periodRiskFree = riskFreeRateAnnual / periodsPerYear;
  const excessReturns = returns.map((r) => r - periodRiskFree);
  const excessStd = stdDev(excessReturns);
  const sharpeRatio = returns.length >= 2 && excessStd > 0 ? (mean(excessReturns) / excessStd) * Math.sqrt(periodsPerYear) : null;

  const downside = excessReturns.filter((r) => r < 0);
  const downsideStd = stdDev(downside);
  const sortinoRatio = returns.length >= 2 && downsideStd > 0 ? (mean(excessReturns) / downsideStd) * Math.sqrt(periodsPerYear) : null;

  const maxDrawdownPct = maxDrawdown(equityCurve);

  const wins = trades.filter((t) => t.netPnl > 0);
  const losses = trades.filter((t) => t.netPnl < 0);
  const winRate = trades.length > 0 ? wins.length / trades.length : null;

  const grossProfit = wins.reduce((acc, t) => acc + t.netPnl, 0);
  const grossLoss = Math.abs(losses.reduce((acc, t) => acc + t.netPnl, 0));
  const profitFactor = trades.length > 0 && grossLoss > 0 ? grossProfit / grossLoss : null;

  const expectancyPerTrade = trades.length > 0 ? mean(trades.map((t) => t.netPnl)) : null;

  const turnover = trades.reduce((acc, t) => acc + t.entryPrice * t.quantity + t.exitPrice * t.quantity, 0);

  return {
    totalReturnPct,
    cagr,
    sharpeRatio,
    sortinoRatio,
    maxDrawdownPct,
    winRate,
    profitFactor,
    expectancyPerTrade,
    turnover,
    sampleSize: trades.length,
    periodDays,
    assumptions: {
      riskFreeRateAnnual,
      costModel,
      periodsPerYearForAnnualization: periodsPerYear,
    },
  };
}

/**
 * Deterministic, event-driven backtest engine.
 *
 * LEAKAGE GUARD (the single most important property of this file): at bar
 * index i, the strategy is evaluated using ONLY bars[0..i] (inclusive) via a
 * bounded trailing window — it never receives bars[i+1..]. This is enforced
 * structurally (the slice is computed before evaluate() is called and never
 * mutated afterward), not just by convention, and is asserted by a dedicated
 * test in test/leakageGuard.test.ts.
 *
 * The window is bounded (not full history from bar 0) to avoid O(n^2) blowup
 * on long backtests and because it mirrors what a live strategy would actually
 * see (a live system doesn't have unbounded growing history either) — see
 * `lookbackWindowBars` in BacktestConfig.
 */
import type { Bar } from "@fintel/domain";
import type { Strategy } from "@fintel/signals";
import { totalOneSidedCost } from "./costs.js";
import type { BacktestConfig, BacktestWarning, EquityPoint, SimulatedTrade } from "./types.js";

export interface BacktestRunResult {
  readonly trades: readonly SimulatedTrade[];
  readonly equityCurve: readonly EquityPoint[];
  readonly warnings: readonly BacktestWarning[];
}

interface OpenPosition {
  readonly direction: "long" | "short";
  readonly entryBucketStartMs: number;
  readonly entryIndex: number;
  readonly entryPrice: number;
  readonly quantity: number;
  readonly capitalAllocated: number;
}

export function runBacktest(
  bars: readonly Bar[],
  strategy: Strategy,
  config: BacktestConfig,
  lookbackWindowBars = Math.max(strategy.minimumBars * 3, 100),
): BacktestRunResult {
  const warnings: BacktestWarning[] = [];
  const trades: SimulatedTrade[] = [];
  const equityCurve: EquityPoint[] = [];

  if (bars.length < strategy.minimumBars + 1) {
    warnings.push({
      code: "INSUFFICIENT_HISTORY",
      message: `Only ${bars.length} bars available; strategy "${strategy.strategyId}" needs at least ${strategy.minimumBars + 1} to produce even one signal.`,
    });
    return { trades, equityCurve, warnings };
  }

  let equity = config.initialCapital;
  let position: OpenPosition | undefined;

  const closePosition = (bar: Bar, currentIndex: number, reason: "reversal" | "end-of-data"): void => {
    if (!position) return;
    const exitPriceQuoted = Number(bar.close);
    const exitSide = position.direction === "long" ? "sell" : "buy";
    const entrySide = position.direction === "long" ? "buy" : "sell";

    const entryCost = totalOneSidedCost(position.entryPrice, position.quantity, entrySide, config.costModel);
    const exitCost = totalOneSidedCost(exitPriceQuoted, position.quantity, exitSide, config.costModel);
    const totalCosts = entryCost + exitCost;

    const grossPnl =
      position.direction === "long"
        ? (exitPriceQuoted - position.entryPrice) * position.quantity
        : (position.entryPrice - exitPriceQuoted) * position.quantity;
    const netPnl = grossPnl - totalCosts;

    trades.push({
      direction: position.direction,
      entryBucketStartMs: position.entryBucketStartMs,
      exitBucketStartMs: bar.bucketStartMs,
      entryPrice: position.entryPrice,
      exitPrice: exitPriceQuoted,
      quantity: position.quantity,
      grossPnl,
      totalCosts,
      netPnl,
      netPnlPct: position.capitalAllocated !== 0 ? netPnl / position.capitalAllocated : 0,
      holdingBars: currentIndex - position.entryIndex,
    });
    equity += netPnl;
    position = undefined;
    void reason;
  };

  for (let i = strategy.minimumBars; i < bars.length; i++) {
    // POINT-IN-TIME SLICE: bars[0..i] only, bounded to a trailing window. Never bars[i+1..].
    const windowStart = Math.max(0, i - lookbackWindowBars + 1);
    const visibleBars = bars.slice(windowStart, i + 1);
    const currentBar = bars[i]!;

    const raw = strategy.evaluate({ instrumentId: currentBar.instrumentId, bars: visibleBars });
    const desiredDirection = raw?.direction ?? "flat";

    if (position && position.direction !== desiredDirection) {
      closePosition(currentBar, i, "reversal");
    }

    if (!position && (desiredDirection === "long" || desiredDirection === "short")) {
      const entryPriceQuoted = Number(currentBar.close);
      const capitalAllocated = equity * config.positionSizing.fraction;
      const quantity = entryPriceQuoted > 0 ? capitalAllocated / entryPriceQuoted : 0;
      if (quantity > 0) {
        position = {
          direction: desiredDirection,
          entryBucketStartMs: currentBar.bucketStartMs,
          entryIndex: i,
          entryPrice: entryPriceQuoted,
          quantity,
          capitalAllocated,
        };
      }
    }

    // Mark-to-market equity for the curve (realized equity + unrealized P&L of any open position).
    let markToMarketEquity = equity;
    if (position) {
      const lastPrice = Number(currentBar.close);
      const unrealized =
        position.direction === "long"
          ? (lastPrice - position.entryPrice) * position.quantity
          : (position.entryPrice - lastPrice) * position.quantity;
      markToMarketEquity = equity + unrealized;
    }
    equityCurve.push({ bucketStartMs: currentBar.bucketStartMs, equity: markToMarketEquity });
  }

  // Close any position still open at the end of the data (mark-to-market realization).
  if (position && bars.length > 0) {
    closePosition(bars[bars.length - 1]!, bars.length - 1, "end-of-data");
    const last = equityCurve[equityCurve.length - 1];
    if (last) equityCurve[equityCurve.length - 1] = { bucketStartMs: last.bucketStartMs, equity };
  }

  if (trades.length < 30) {
    warnings.push({
      code: "LOW_SAMPLE_SIZE",
      message: `Only ${trades.length} trades generated. Any performance metric from this run is NOT statistically meaningful (spec: sample size must always accompany metrics) — treat this as exploratory only.`,
    });
  }

  return { trades, equityCurve, warnings };
}

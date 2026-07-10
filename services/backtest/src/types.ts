/**
 * Domain types for the Backtest Engine. Kept local to this package (rather
 * than in @fintel/domain) since they represent simulation artifacts, not
 * persisted trading-platform entities — the boundary matters: a SimulatedTrade
 * is a hypothesis-testing construct, never confused with a real Transaction.
 */
import type { SignalDirection } from "@fintel/domain";
import type { CostModelConfig } from "./costs.js";

export interface PositionSizingConfig {
  readonly method: "fixed-fractional";
  /** Fraction of current equity risked per position, e.g. 0.1 = 10%. */
  readonly fraction: number;
}

export const DEFAULT_POSITION_SIZING: PositionSizingConfig = {
  method: "fixed-fractional",
  fraction: 0.1,
};

export interface BacktestConfig {
  readonly instrumentId: string;
  readonly strategyId: string;
  readonly initialCapital: number;
  readonly costModel: CostModelConfig;
  readonly positionSizing: PositionSizingConfig;
  /** Minimum number of bars of history the strategy needs before it can be evaluated at all (mirrors Strategy.minimumBars). */
  readonly warmupBars: number;
}

export interface SimulatedTrade {
  readonly direction: SignalDirection; // "long" or "short" (this engine does not model "flat" as a held position)
  readonly entryBucketStartMs: number;
  readonly exitBucketStartMs: number;
  readonly entryPrice: number; // quoted price before costs
  readonly exitPrice: number; // quoted price before costs
  readonly quantity: number;
  readonly grossPnl: number; // before costs
  readonly totalCosts: number; // entry + exit costs combined
  readonly netPnl: number; // grossPnl - totalCosts
  readonly netPnlPct: number; // netPnl / capital allocated to this trade
  readonly holdingBars: number;
}

export interface EquityPoint {
  readonly bucketStartMs: number;
  readonly equity: number;
}

export interface BacktestWarning {
  readonly code: string;
  readonly message: string;
}

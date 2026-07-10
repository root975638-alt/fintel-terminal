/**
 * Walk-forward IS/OOS split — the honesty backbone of this backtest engine.
 * Splits the bar history into a contiguous In-Sample (IS) segment followed by
 * an Out-Of-Sample (OOS) segment, and runs the backtest engine on each
 * INDEPENDENTLY (separate starting capital, separate state). The OOS segment
 * uses ONLY its own bars — no warmup borrowing from the IS segment — which is
 * the simpler, unambiguously leakage-free choice (it may understate OOS trade
 * count if the strategy needs a long warmup, surfaced honestly via the
 * engine's own INSUFFICIENT_HISTORY/LOW_SAMPLE_SIZE warnings rather than
 * silently borrowing IS data to pad it out).
 *
 * A strategy's signals may only be honestly described as more than
 * `HYPOTHESIS` if OOS performance holds up — see quant-research's promotion
 * criteria for the (deliberately conservative, rarely-met) bar for that.
 */
import type { Bar } from "@fintel/domain";
import type { Strategy } from "@fintel/signals";
import { runBacktest, type BacktestRunResult } from "./engine.js";
import { computeMetrics, type BacktestMetrics, type ComputeMetricsOptions } from "./metrics.js";
import type { BacktestConfig } from "./types.js";

export interface WalkForwardConfig {
  /** Fraction of bars (by count, in time order) assigned to the in-sample segment. Default 0.7 (70% IS / 30% OOS). */
  readonly inSampleFraction: number;
}

export const DEFAULT_WALK_FORWARD_CONFIG: WalkForwardConfig = {
  inSampleFraction: 0.7,
};

export interface SegmentReport {
  readonly run: BacktestRunResult;
  readonly metrics: BacktestMetrics;
  readonly barCount: number;
  readonly fromBucketStartMs: number | null;
  readonly toBucketStartMs: number | null;
}

export interface WalkForwardReport {
  readonly inSample: SegmentReport;
  readonly outOfSample: SegmentReport;
  readonly splitBucketStartMs: number | null;
  /**
   * Honest summary comparing IS and OOS performance. This is NOT a pass/fail
   * verdict on its own — see quant-research for the actual promotion decision,
   * which additionally requires minimum sample size.
   */
  readonly oosHoldsUp: boolean | null; // null = insufficient OOS trades to judge
}

function computeSegmentReport(
  bars: readonly Bar[],
  strategy: Strategy,
  config: BacktestConfig,
  metricsOpts: ComputeMetricsOptions,
): SegmentReport {
  const run = runBacktest(bars, strategy, config);
  const metrics = computeMetrics(run.trades, run.equityCurve, config.initialCapital, config.costModel, metricsOpts);
  return {
    run,
    metrics,
    barCount: bars.length,
    fromBucketStartMs: bars.length > 0 ? bars[0]!.bucketStartMs : null,
    toBucketStartMs: bars.length > 0 ? bars[bars.length - 1]!.bucketStartMs : null,
  };
}

export function runWalkForwardBacktest(
  bars: readonly Bar[],
  strategy: Strategy,
  config: BacktestConfig,
  walkForwardConfig: WalkForwardConfig = DEFAULT_WALK_FORWARD_CONFIG,
  metricsOpts: ComputeMetricsOptions = {},
): WalkForwardReport {
  const splitIndex = Math.floor(bars.length * walkForwardConfig.inSampleFraction);
  const isBars = bars.slice(0, splitIndex);
  const oosBars = bars.slice(splitIndex); // OOS sees ONLY its own bars — no IS warmup borrowing

  const inSample = computeSegmentReport(isBars, strategy, config, metricsOpts);
  const outOfSample = computeSegmentReport(oosBars, strategy, config, metricsOpts);

  const MIN_TRADES_TO_JUDGE = 10; // deliberately conservative; below this, any conclusion is noise
  const oosHoldsUp =
    outOfSample.metrics.sampleSize >= MIN_TRADES_TO_JUDGE
      ? outOfSample.metrics.totalReturnPct > 0 && (outOfSample.metrics.sharpeRatio ?? -Infinity) > 0
      : null;

  return {
    inSample,
    outOfSample,
    splitBucketStartMs: oosBars.length > 0 ? oosBars[0]!.bucketStartMs : null,
    oosHoldsUp,
  };
}

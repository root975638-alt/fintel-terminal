import { createHash } from "node:crypto";
import type { Bar } from "@fintel/domain";
import {
  runWalkForwardBacktest,
  DEFAULT_COST_MODEL,
  DEFAULT_POSITION_SIZING,
  DEFAULT_WALK_FORWARD_CONFIG,
  type BacktestConfig,
  type WalkForwardConfig,
  type WalkForwardReport,
} from "@fintel/backtest";
import type { Strategy } from "@fintel/signals";
import type { PersistenceLayer, BacktestRunRecord } from "@fintel/persistence";
import { evaluateSingleRun, decideLabelFromHistory, type PromotionDecision } from "./promotion.js";

export * from "./promotion.js";

export interface RunExperimentOptions {
  readonly instrumentId: string;
  readonly bars: readonly Bar[];
  readonly strategy: Strategy;
  readonly initialCapital?: number;
  readonly walkForwardConfig?: WalkForwardConfig;
  readonly persistence: PersistenceLayer;
}

export interface ExperimentResult {
  readonly runId: string;
  readonly report: WalkForwardReport;
  readonly decision: PromotionDecision;
}

/**
 * Runs a full walk-forward backtest experiment, records it to the registry
 * (SUCCESS OR FAILURE — every run is recorded, never just winners), and
 * returns the honestly-derived label decision. This is the ONLY code path
 * that should ever set a strategy's promoted label.
 */
export async function runExperiment(opts: RunExperimentOptions): Promise<ExperimentResult> {
  const initialCapital = opts.initialCapital ?? 100_000;
  const walkForwardConfig = opts.walkForwardConfig ?? DEFAULT_WALK_FORWARD_CONFIG;

  const config: BacktestConfig = {
    instrumentId: opts.instrumentId,
    strategyId: opts.strategy.strategyId,
    initialCapital,
    costModel: DEFAULT_COST_MODEL,
    positionSizing: DEFAULT_POSITION_SIZING,
    warmupBars: opts.strategy.minimumBars,
  };

  const report = runWalkForwardBacktest(opts.bars, opts.strategy, config, walkForwardConfig);
  const { clearsExperimentalBar, reasons } = evaluateSingleRun(report);

  const priorRuns = await opts.persistence.backtestRuns.listForStrategy(opts.strategy.strategyId, 1000);
  const decision = decideLabelFromHistory(clearsExperimentalBar, reasons, priorRuns);

  const runId = createHash("sha256")
    .update(`${opts.instrumentId}|${opts.strategy.strategyId}|${Date.now()}|${Math.random()}`)
    .digest("hex")
    .slice(0, 24);

  const record: BacktestRunRecord = {
    runId,
    instrumentId: opts.instrumentId,
    strategyId: opts.strategy.strategyId,
    runAtMs: Date.now(),
    inSampleFraction: walkForwardConfig.inSampleFraction,
    initialCapital,
    costModelJson: JSON.stringify(config.costModel),
    isBarCount: report.inSample.barCount,
    isTradeCount: report.inSample.metrics.sampleSize,
    isTotalReturnPct: report.inSample.metrics.totalReturnPct,
    isSharpeRatio: report.inSample.metrics.sharpeRatio,
    isMaxDrawdownPct: report.inSample.metrics.maxDrawdownPct,
    oosBarCount: report.outOfSample.barCount,
    oosTradeCount: report.outOfSample.metrics.sampleSize,
    oosTotalReturnPct: report.outOfSample.metrics.totalReturnPct,
    oosSharpeRatio: report.outOfSample.metrics.sharpeRatio,
    oosMaxDrawdownPct: report.outOfSample.metrics.maxDrawdownPct,
    oosHoldsUp: report.oosHoldsUp,
    promotedLabel: decision.label,
    fullReportJson: JSON.stringify(report),
  };
  await opts.persistence.backtestRuns.insert(record);

  return { runId, report, decision };
}

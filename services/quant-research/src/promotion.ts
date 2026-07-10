/**
 * Promotion criteria — the ONLY mechanism by which a strategy's honestyLabel
 * may move away from `HYPOTHESIS`. These bars are deliberately conservative
 * and documented here so they cannot be silently loosened to make a strategy
 * "look" validated (spec Section 0: no fabricated backtest/performance
 * numbers, no claiming validation without genuine out-of-sample evidence).
 *
 * IMPORTANT: this module does not talk the strategy into a good grade. If a
 * strategy fails these bars, the answer is `HYPOTHESIS`, full stop — even if
 * that's disappointing. See docs/017_QUANT_RESEARCH_ENGINE.md for the actual,
 * honest results observed when this was run against the Milestone 1 strategies.
 */
import type { Signal } from "@fintel/domain";
import type { WalkForwardReport } from "@fintel/backtest";
import type { BacktestRunRecord } from "@fintel/persistence";

export const MIN_OOS_TRADES_FOR_EXPERIMENTAL = 30;
export const MIN_CLEARING_RUNS_FOR_ESTABLISHED = 3;

export type HonestyLabel = Signal["honestyLabel"];

export interface PromotionDecision {
  readonly label: HonestyLabel;
  readonly reasons: readonly string[];
}

/**
 * Evaluates a SINGLE walk-forward run against the EXPERIMENTAL bar. Does not
 * consider run history — see `decideLabelFromHistory` for the ESTABLISHED bar,
 * which requires multiple independently-clearing runs.
 */
export function evaluateSingleRun(report: WalkForwardReport): { clearsExperimentalBar: boolean; reasons: string[] } {
  const reasons: string[] = [];
  const oos = report.outOfSample.metrics;
  const is = report.inSample.metrics;

  if (oos.sampleSize < MIN_OOS_TRADES_FOR_EXPERIMENTAL) {
    reasons.push(
      `OOS trade count (${oos.sampleSize}) is below the minimum of ${MIN_OOS_TRADES_FOR_EXPERIMENTAL} required for statistical meaningfulness.`,
    );
  }
  if (oos.totalReturnPct <= 0) {
    reasons.push(`OOS total return (${(oos.totalReturnPct * 100).toFixed(2)}%) is not positive.`);
  }
  if ((oos.sharpeRatio ?? -Infinity) <= 0) {
    reasons.push(`OOS Sharpe ratio (${oos.sharpeRatio?.toFixed(3) ?? "undefined"}) is not positive.`);
  }
  if (is.totalReturnPct <= 0) {
    reasons.push(
      `In-sample total return (${(is.totalReturnPct * 100).toFixed(2)}%) is not positive — OOS result would be ` +
        `inconsistent with IS behavior, suggesting noise rather than a genuine effect.`,
    );
  }

  return { clearsExperimentalBar: reasons.length === 0, reasons };
}

/**
 * Decides the honest label for a strategy given its FULL run history (from the
 * registry), applying the ESTABLISHED bar: at least `MIN_CLEARING_RUNS_FOR_ESTABLISHED`
 * independent runs (different instrument and/or time period) must each
 * individually clear the EXPERIMENTAL bar. A single good run is EXPERIMENTAL
 * at best, never ESTABLISHED — one lucky backtest is not validation.
 */
export function decideLabelFromHistory(
  currentRunClearsExperimentalBar: boolean,
  currentRunReasons: readonly string[],
  priorRuns: readonly BacktestRunRecord[],
): PromotionDecision {
  if (!currentRunClearsExperimentalBar) {
    return { label: "HYPOTHESIS", reasons: [...currentRunReasons] };
  }

  const clearingPriorRuns = priorRuns.filter((r) => r.oosHoldsUp === true && r.promotedLabel !== "HYPOTHESIS");
  const distinctInstruments = new Set(clearingPriorRuns.map((r) => r.instrumentId));
  const totalClearingRuns = clearingPriorRuns.length + 1; // +1 for the current run

  if (totalClearingRuns >= MIN_CLEARING_RUNS_FOR_ESTABLISHED && distinctInstruments.size >= 2) {
    return {
      label: "ESTABLISHED",
      reasons: [
        `${totalClearingRuns} independent runs (across ${distinctInstruments.size + 1} instruments including this one) ` +
          `have each cleared the EXPERIMENTAL bar (OOS trades >= ${MIN_OOS_TRADES_FOR_EXPERIMENTAL}, positive OOS return, ` +
          `positive OOS Sharpe, IS/OOS directionally consistent).`,
      ],
    };
  }

  return {
    label: "EXPERIMENTAL",
    reasons: [
      "This run clears the EXPERIMENTAL bar (positive OOS return, positive OOS Sharpe, sufficient OOS trade " +
        "count, IS/OOS directional consistency), but has not yet accumulated enough independent clearing runs " +
        `(${totalClearingRuns}/${MIN_CLEARING_RUNS_FOR_ESTABLISHED} needed, across >=2 distinct instruments) to ` +
        "be called ESTABLISHED. A single good backtest is not validation.",
    ],
  };
}

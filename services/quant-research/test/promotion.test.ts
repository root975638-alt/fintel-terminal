import { describe, expect, it } from "vitest";
import { evaluateSingleRun, decideLabelFromHistory, MIN_OOS_TRADES_FOR_EXPERIMENTAL, MIN_CLEARING_RUNS_FOR_ESTABLISHED } from "../src/promotion.js";
import type { WalkForwardReport, SegmentReport } from "@fintel/backtest";
import type { BacktestRunRecord } from "@fintel/persistence";

function makeSegment(sampleSize: number, totalReturnPct: number, sharpeRatio: number | null): SegmentReport {
  return {
    run: { trades: [], equityCurve: [], warnings: [] },
    metrics: {
      totalReturnPct,
      cagr: null,
      sharpeRatio,
      sortinoRatio: null,
      maxDrawdownPct: 0.05,
      winRate: 0.5,
      profitFactor: 1.2,
      expectancyPerTrade: 10,
      turnover: 1000,
      sampleSize,
      periodDays: 100,
      assumptions: { riskFreeRateAnnual: 0, costModel: { spreadBps: 5, slippageBps: 3, commissionBps: 2 }, periodsPerYearForAnnualization: 252 },
    },
    barCount: sampleSize * 3,
    fromBucketStartMs: 0,
    toBucketStartMs: 1000,
  };
}

function makeReport(is: SegmentReport, oos: SegmentReport): WalkForwardReport {
  return { inSample: is, outOfSample: oos, splitBucketStartMs: 500, oosHoldsUp: null };
}

describe("evaluateSingleRun", () => {
  it("clears the experimental bar when all conditions are met", () => {
    const report = makeReport(makeSegment(50, 0.1, 0.5), makeSegment(35, 0.05, 0.3));
    const { clearsExperimentalBar, reasons } = evaluateSingleRun(report);
    expect(clearsExperimentalBar).toBe(true);
    expect(reasons).toHaveLength(0);
  });

  it("fails when OOS trade count is below the minimum", () => {
    const report = makeReport(makeSegment(50, 0.1, 0.5), makeSegment(MIN_OOS_TRADES_FOR_EXPERIMENTAL - 1, 0.05, 0.3));
    const { clearsExperimentalBar, reasons } = evaluateSingleRun(report);
    expect(clearsExperimentalBar).toBe(false);
    expect(reasons.some((r) => r.includes("trade count"))).toBe(true);
  });

  it("fails when OOS return is not positive", () => {
    const report = makeReport(makeSegment(50, 0.1, 0.5), makeSegment(40, -0.02, 0.3));
    const { clearsExperimentalBar } = evaluateSingleRun(report);
    expect(clearsExperimentalBar).toBe(false);
  });

  it("fails when OOS Sharpe is not positive even if return happens to be positive", () => {
    const report = makeReport(makeSegment(50, 0.1, 0.5), makeSegment(40, 0.01, -0.1));
    const { clearsExperimentalBar, reasons } = evaluateSingleRun(report);
    expect(clearsExperimentalBar).toBe(false);
    expect(reasons.some((r) => r.includes("Sharpe"))).toBe(true);
  });

  it("fails when IS return is not positive (directional inconsistency)", () => {
    const report = makeReport(makeSegment(50, -0.05, 0.5), makeSegment(40, 0.05, 0.3));
    const { clearsExperimentalBar, reasons } = evaluateSingleRun(report);
    expect(clearsExperimentalBar).toBe(false);
    expect(reasons.some((r) => r.includes("In-sample"))).toBe(true);
  });
});

function makeRunRecord(instrumentId: string, oosHoldsUp: boolean | null, promotedLabel: string): BacktestRunRecord {
  return {
    runId: `run-${instrumentId}-${Math.random()}`,
    instrumentId,
    strategyId: "test-strategy",
    runAtMs: Date.now(),
    inSampleFraction: 0.7,
    initialCapital: 100_000,
    costModelJson: "{}",
    isBarCount: 100,
    isTradeCount: 50,
    isTotalReturnPct: 0.1,
    isSharpeRatio: 0.5,
    isMaxDrawdownPct: 0.05,
    oosBarCount: 40,
    oosTradeCount: 35,
    oosTotalReturnPct: 0.05,
    oosSharpeRatio: 0.3,
    oosMaxDrawdownPct: 0.03,
    oosHoldsUp,
    promotedLabel,
    fullReportJson: "{}",
  };
}

describe("decideLabelFromHistory", () => {
  it("returns HYPOTHESIS immediately if the current run does not clear the experimental bar", () => {
    const decision = decideLabelFromHistory(false, ["some failure reason"], []);
    expect(decision.label).toBe("HYPOTHESIS");
    expect(decision.reasons).toEqual(["some failure reason"]);
  });

  it("returns EXPERIMENTAL for a single clearing run with no prior history", () => {
    const decision = decideLabelFromHistory(true, [], []);
    expect(decision.label).toBe("EXPERIMENTAL");
  });

  it("does NOT promote to ESTABLISHED from a single good run alone, even with prior non-clearing runs", () => {
    const priorRuns = [
      makeRunRecord("A", false, "HYPOTHESIS"),
      makeRunRecord("A", null, "HYPOTHESIS"),
    ];
    const decision = decideLabelFromHistory(true, [], priorRuns);
    expect(decision.label).toBe("EXPERIMENTAL");
  });

  it("promotes to ESTABLISHED only after enough independent clearing runs across multiple instruments", () => {
    // MIN_CLEARING_RUNS_FOR_ESTABLISHED = 3; need 2 prior clearing runs (on >=1 other instrument) + this one.
    const priorRuns = [
      makeRunRecord("INSTRUMENT_B", true, "EXPERIMENTAL"),
      makeRunRecord("INSTRUMENT_C", true, "EXPERIMENTAL"),
    ];
    const decision = decideLabelFromHistory(true, [], priorRuns);
    expect(decision.label).toBe("ESTABLISHED");
  });

  it("does not promote to ESTABLISHED if clearing runs are all on the same single instrument (needs diversity)", () => {
    const priorRuns = [
      makeRunRecord("INSTRUMENT_B", true, "EXPERIMENTAL"),
      makeRunRecord("INSTRUMENT_B", true, "EXPERIMENTAL"),
    ];
    const decision = decideLabelFromHistory(true, [], priorRuns);
    // Only 2 distinct instruments total (this run's + INSTRUMENT_B) is < 2 distinct required... actually
    // distinctInstruments.size counts prior runs only (INSTRUMENT_B), so size=1, needs >=2 -> not established.
    expect(decision.label).toBe("EXPERIMENTAL");
  });

  it("ignores prior runs that did not hold up OOS when counting toward ESTABLISHED", () => {
    const priorRuns = [
      makeRunRecord("B", false, "HYPOTHESIS"),
      makeRunRecord("C", true, "EXPERIMENTAL"),
    ];
    const decision = decideLabelFromHistory(true, [], priorRuns);
    expect(decision.label).toBe("EXPERIMENTAL"); // only 1 valid prior + this one = 2, still below MIN_CLEARING_RUNS_FOR_ESTABLISHED
  });
});

describe("exported constants are sane", () => {
  it("MIN_OOS_TRADES_FOR_EXPERIMENTAL is a conservative statistical minimum", () => {
    expect(MIN_OOS_TRADES_FOR_EXPERIMENTAL).toBeGreaterThanOrEqual(30);
  });

  it("MIN_CLEARING_RUNS_FOR_ESTABLISHED requires more than one run", () => {
    expect(MIN_CLEARING_RUNS_FOR_ESTABLISHED).toBeGreaterThanOrEqual(3);
  });
});

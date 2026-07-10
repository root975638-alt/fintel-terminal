import { describe, expect, it } from "vitest";
import { discountedCashFlow, comparablesValuation } from "../src/valuation.js";

describe("discountedCashFlow", () => {
  it("computes PV of a single cash flow correctly (hand-calculated)", () => {
    // CF=110 at year 1, discount rate 10% -> PV = 110/1.1 = 100
    const result = discountedCashFlow([110], {
      discountRateAnnual: 0.1,
      terminalGrowthRateAnnual: 0, // no terminal growth for this isolated check... but terminal value still applies
      projectionYears: 1,
    });
    // presentValueOfProjectedCashFlows should be exactly 100
    expect(result.presentValueOfProjectedCashFlows).toBeCloseTo(100, 8);
  });

  it("computes terminal value using the Gordon Growth model correctly", () => {
    // Single year CF=100, r=10%, g=4%: TV_at_year1 = 100*1.04/(0.10-0.04) = 173.33; PV = 173.33/1.1 = 157.58
    const result = discountedCashFlow([100], {
      discountRateAnnual: 0.1,
      terminalGrowthRateAnnual: 0.04,
      projectionYears: 1,
    });
    const expectedTerminalAtYear1 = (100 * 1.04) / (0.1 - 0.04);
    const expectedPvOfTerminal = expectedTerminalAtYear1 / 1.1;
    expect(result.presentValueOfTerminalValue).toBeCloseTo(expectedPvOfTerminal, 6);
  });

  it("sums PV of cash flows and PV of terminal value into enterpriseValue", () => {
    const result = discountedCashFlow([100], { discountRateAnnual: 0.1, terminalGrowthRateAnnual: 0.04, projectionYears: 1 });
    expect(result.enterpriseValue).toBeCloseTo(
      result.presentValueOfProjectedCashFlows + result.presentValueOfTerminalValue,
      10,
    );
  });

  it("warns and zeroes terminal value when terminal growth >= discount rate (mathematically undefined)", () => {
    const result = discountedCashFlow([100], { discountRateAnnual: 0.05, terminalGrowthRateAnnual: 0.05, projectionYears: 1 });
    expect(result.presentValueOfTerminalValue).toBe(0);
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it("returns a zero result with a warning for an empty cash-flow projection", () => {
    const result = discountedCashFlow([], { discountRateAnnual: 0.1, terminalGrowthRateAnnual: 0.03, projectionYears: 0 });
    expect(result.enterpriseValue).toBe(0);
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it("always includes the assumptions used, alongside the result", () => {
    const assumptions = { discountRateAnnual: 0.08, terminalGrowthRateAnnual: 0.02, projectionYears: 5 };
    const result = discountedCashFlow([10, 20, 30, 40, 50], assumptions);
    expect(result.assumptions).toEqual(assumptions);
  });
});

describe("comparablesValuation", () => {
  it("applies the median peer multiple to the target metric", () => {
    // peers P/E: 10, 15, 20 -> median = 15; target EPS = 4 -> implied value = 60
    const result = comparablesValuation(4, [10, 15, 20], "P/E");
    expect(result.impliedValuePerShare).toBeCloseTo(60, 10);
    expect(result.peerMultipleUsed).toBeCloseTo(15, 10);
  });

  it("computes median correctly for an even number of peers", () => {
    // peers: 10, 20, 30, 40 -> median = (20+30)/2 = 25
    const result = comparablesValuation(2, [10, 20, 30, 40], "P/E");
    expect(result.peerMultipleUsed).toBeCloseTo(25, 10);
  });

  it("warns when fewer than 3 peers are supplied", () => {
    const result = comparablesValuation(4, [10, 20], "P/E");
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it("returns a zero result with a warning for an empty peer set", () => {
    const result = comparablesValuation(4, [], "P/E");
    expect(result.impliedValuePerShare).toBe(0);
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it("is always labeled EXPERIMENTAL (peer-set selection is inherently subjective)", () => {
    const result = comparablesValuation(4, [10, 15, 20], "P/E");
    expect(result.honestyLabel).toBe("EXPERIMENTAL");
  });
});

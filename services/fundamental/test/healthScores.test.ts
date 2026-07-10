import { describe, expect, it } from "vitest";
import { piotroskiFScore, altmanZScore, type PiotroskiInputs, type AltmanZInputs } from "../src/healthScores.js";

function makeImprovingCompany(): PiotroskiInputs {
  return {
    roa: 0.1,
    priorRoa: 0.08,
    operatingCashFlow: 150,
    netIncome: 100,
    longTermDebt: 200,
    priorLongTermDebt: 250,
    totalAssets: 1000,
    priorTotalAssets: 950,
    currentRatio: 2.0,
    priorCurrentRatio: 1.8,
    sharesOutstanding: 100,
    priorSharesOutstanding: 100,
    grossMargin: 0.45,
    priorGrossMargin: 0.4,
    revenue: 800,
    priorRevenue: 700,
  };
}

describe("piotroskiFScore", () => {
  it("scores 9/9 for a company improving on every dimension", () => {
    const result = piotroskiFScore(makeImprovingCompany());
    expect(result.score).toBe(9);
    expect(Object.values(result.criteria).every(Boolean)).toBe(true);
  });

  it("scores 0/9 for a company deteriorating on every dimension", () => {
    const deteriorating: PiotroskiInputs = {
      roa: -0.05,
      priorRoa: 0.05,
      operatingCashFlow: -10,
      netIncome: 20, // cashFlow(-10) < netIncome(20) -> fails quality-of-earnings check
      longTermDebt: 300,
      priorLongTermDebt: 200, // leverage increased -> fails
      totalAssets: 1000,
      priorTotalAssets: 1000,
      currentRatio: 1.0,
      priorCurrentRatio: 1.5, // liquidity worsened -> fails
      sharesOutstanding: 150,
      priorSharesOutstanding: 100, // new shares issued -> fails
      grossMargin: 0.3,
      priorGrossMargin: 0.4, // margin worsened -> fails
      revenue: 700,
      priorRevenue: 800, // asset turnover worsened -> fails
    };
    const result = piotroskiFScore(deteriorating);
    expect(result.score).toBe(0);
  });

  it("correctly identifies individual failing criteria in a mixed case", () => {
    const mixed = { ...makeImprovingCompany(), sharesOutstanding: 120 }; // new shares issued -> this one criterion fails
    const result = piotroskiFScore(mixed);
    expect(result.criteria.noNewSharesIssued).toBe(false);
    expect(result.score).toBe(8); // all others still pass
  });

  it("is labeled EXPERIMENTAL with an interpretation note, never a bare score", () => {
    const result = piotroskiFScore(makeImprovingCompany());
    expect(result.honestyLabel).toBe("EXPERIMENTAL");
    expect(result.interpretationNote.length).toBeGreaterThan(0);
  });
});

describe("altmanZScore", () => {
  it("computes the Z-score using the exact 1968 formula weights", () => {
    const inputs: AltmanZInputs = {
      workingCapital: 200,
      totalAssets: 1000,
      retainedEarnings: 300,
      ebit: 150,
      marketValueOfEquity: 2000,
      totalLiabilities: 500,
      revenue: 900,
    };
    // A=0.2, B=0.3, C=0.15, D=4, E=0.9
    // Z = 1.2*0.2 + 1.4*0.3 + 3.3*0.15 + 0.6*4 + 1.0*0.9
    const expected = 1.2 * 0.2 + 1.4 * 0.3 + 3.3 * 0.15 + 0.6 * 4 + 1.0 * 0.9;
    const result = altmanZScore(inputs);
    expect(result.zScore).toBeCloseTo(expected, 10);
  });

  it("classifies a high Z-score as 'safe'", () => {
    const result = altmanZScore({
      workingCapital: 500,
      totalAssets: 1000,
      retainedEarnings: 600,
      ebit: 300,
      marketValueOfEquity: 5000,
      totalLiabilities: 300,
      revenue: 1200,
    });
    expect(result.zScore).toBeGreaterThan(2.99);
    expect(result.zone).toBe("safe");
  });

  it("classifies a low Z-score as 'distress'", () => {
    const result = altmanZScore({
      workingCapital: -100,
      totalAssets: 1000,
      retainedEarnings: -200,
      ebit: 10,
      marketValueOfEquity: 100,
      totalLiabilities: 900,
      revenue: 300,
    });
    expect(result.zScore).toBeLessThan(1.81);
    expect(result.zone).toBe("distress");
  });

  it("is labeled EXPERIMENTAL with a sector-limitation interpretation note", () => {
    const result = altmanZScore({
      workingCapital: 200,
      totalAssets: 1000,
      retainedEarnings: 300,
      ebit: 150,
      marketValueOfEquity: 2000,
      totalLiabilities: 500,
      revenue: 900,
    });
    expect(result.honestyLabel).toBe("EXPERIMENTAL");
    expect(result.interpretationNote).toMatch(/manufacturing/i);
  });
});

import { describe, expect, it } from "vitest";
import {
  peRatio,
  pbRatio,
  psRatio,
  evToEbitda,
  roe,
  roa,
  roic,
  grossMargin,
  operatingMargin,
  netMargin,
  currentRatio,
  quickRatio,
  debtToEquity,
  interestCoverage,
  fcfYield,
  dividendYield,
  payoutRatio,
  yoyGrowth,
  cagr,
} from "../src/ratios.js";

describe("valuation multiples", () => {
  it("computes P/E correctly", () => {
    expect(peRatio(100, 5)).toBeCloseTo(20, 10);
  });
  it("computes P/B correctly", () => {
    expect(pbRatio(50, 25)).toBeCloseTo(2, 10);
  });
  it("computes P/S correctly", () => {
    expect(psRatio(1_000_000, 250_000)).toBeCloseTo(4, 10);
  });
  it("computes EV/EBITDA correctly (EV = marketCap + debt - cash)", () => {
    // marketCap=1000, debt=200, cash=100 -> EV=1100; ebitda=110 -> 10
    expect(evToEbitda(1000, 200, 100, 110)).toBeCloseTo(10, 10);
  });
  it("returns null when denominator is zero", () => {
    expect(peRatio(100, 0)).toBeNull();
  });
});

describe("profitability ratios", () => {
  it("computes ROE correctly", () => {
    expect(roe(50, 500)).toBeCloseTo(0.1, 10);
  });
  it("computes ROA correctly", () => {
    expect(roa(50, 1000)).toBeCloseTo(0.05, 10);
  });
  it("computes ROIC correctly (invested capital = debt + equity - cash)", () => {
    // nopat=80, debt=300, equity=500, cash=100 -> investedCapital=700 -> 80/700
    expect(roic(80, 300, 500, 100)).toBeCloseTo(80 / 700, 10);
  });
  it("computes gross/operating/net margins correctly", () => {
    expect(grossMargin(400, 1000)).toBeCloseTo(0.4, 10);
    expect(operatingMargin(200, 1000)).toBeCloseTo(0.2, 10);
    expect(netMargin(100, 1000)).toBeCloseTo(0.1, 10);
  });
});

describe("liquidity/solvency ratios", () => {
  it("computes current ratio correctly", () => {
    expect(currentRatio(300, 150)).toBeCloseTo(2, 10);
  });
  it("computes quick ratio correctly (excludes inventory)", () => {
    expect(quickRatio(300, 100, 150)).toBeCloseTo(200 / 150, 10);
  });
  it("computes debt-to-equity correctly", () => {
    expect(debtToEquity(400, 800)).toBeCloseTo(0.5, 10);
  });
  it("computes interest coverage correctly", () => {
    expect(interestCoverage(500, 50)).toBeCloseTo(10, 10);
  });
});

describe("cash-flow / shareholder-return ratios", () => {
  it("computes FCF yield correctly", () => {
    expect(fcfYield(50, 1000)).toBeCloseTo(0.05, 10);
  });
  it("computes dividend yield correctly", () => {
    expect(dividendYield(2, 100)).toBeCloseTo(0.02, 10);
  });
  it("computes payout ratio correctly", () => {
    expect(payoutRatio(40, 100)).toBeCloseTo(0.4, 10);
  });
});

describe("growth", () => {
  it("computes YoY growth correctly for a positive base", () => {
    expect(yoyGrowth(120, 100)).toBeCloseTo(0.2, 10);
  });
  it("computes YoY growth correctly for a negative-to-positive swing (uses abs of previous)", () => {
    // previous = -50, current = 50 -> (50 - (-50)) / |-50| = 100/50 = 2
    expect(yoyGrowth(50, -50)).toBeCloseTo(2, 10);
  });
  it("returns null when previous value is zero (growth rate undefined)", () => {
    expect(yoyGrowth(100, 0)).toBeNull();
  });
  it("computes CAGR correctly for a known doubling over 1 year", () => {
    expect(cagr(1000, 2000, 1)).toBeCloseTo(1.0, 10);
  });
  it("computes CAGR correctly for a known doubling over 2 years (sqrt(2)-1)", () => {
    expect(cagr(1000, 2000, 2)).toBeCloseTo(Math.sqrt(2) - 1, 10);
  });
  it("returns null for non-positive beginning/ending values or non-positive years", () => {
    expect(cagr(-100, 200, 1)).toBeNull();
    expect(cagr(100, -200, 1)).toBeNull();
    expect(cagr(100, 200, 0)).toBeNull();
  });
});

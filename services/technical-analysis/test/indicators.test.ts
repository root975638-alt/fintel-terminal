import { describe, expect, it } from "vitest";
import { sma, ema, rsiWilder, macd, bollingerBands, atrWilder, historicalVolatility } from "../src/index.js";

describe("sma", () => {
  it("computes simple moving average with known hand-calculated values", () => {
    const values = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const result = sma(values, 3);
    // First 2 positions undefined (insufficient history), then rolling mean of 3.
    expect(result[0]).toBeNull();
    expect(result[1]).toBeNull();
    expect(result[2]).toBeCloseTo((1 + 2 + 3) / 3, 10);
    expect(result[3]).toBeCloseTo((2 + 3 + 4) / 3, 10);
    expect(result[9]).toBeCloseTo((8 + 9 + 10) / 3, 10);
  });

  it("throws on non-positive period", () => {
    expect(() => sma([1, 2, 3], 0)).toThrow();
    expect(() => sma([1, 2, 3], -1)).toThrow();
  });
});

describe("ema", () => {
  it("matches hand-calculated EMA for a simple constant-then-jump series", () => {
    // Constant series: EMA should equal the constant value once seeded.
    const constant = new Array(10).fill(5);
    const result = ema(constant, 3);
    expect(result[2]).toBeCloseTo(5, 10);
    expect(result[9]).toBeCloseTo(5, 10);
  });

  it("computes a known 3-period EMA by hand", () => {
    // values: 1,2,3,4,5 ; period=3 => alpha=0.5
    // seed (SMA of first 3) = (1+2+3)/3 = 2  at index 2
    // index 3: ema = 4*0.5 + 2*0.5 = 3
    // index 4: ema = 5*0.5 + 3*0.5 = 4
    const values = [1, 2, 3, 4, 5];
    const result = ema(values, 3);
    expect(result[2]).toBeCloseTo(2, 10);
    expect(result[3]).toBeCloseTo(3, 10);
    expect(result[4]).toBeCloseTo(4, 10);
  });
});

describe("rsiWilder", () => {
  it("approaches 100 for a strictly increasing series (all gains, no losses)", () => {
    const values = Array.from({ length: 30 }, (_, i) => 100 + i); // strictly increasing
    const result = rsiWilder(values, 14);
    const lastValue = result[result.length - 1];
    expect(lastValue).not.toBeNull();
    expect(lastValue as number).toBeGreaterThan(99);
  });

  it("approaches 0 for a strictly decreasing series (all losses, no gains)", () => {
    const values = Array.from({ length: 30 }, (_, i) => 200 - i);
    const result = rsiWilder(values, 14);
    const lastValue = result[result.length - 1];
    expect(lastValue).not.toBeNull();
    expect(lastValue as number).toBeLessThan(1);
  });

  it("returns 50 for a perfectly flat series (no gains or losses)", () => {
    const values = new Array(30).fill(100);
    const result = rsiWilder(values, 14);
    expect(result[14]).toBe(50);
  });

  it("leaves the first `period` entries null (insufficient history)", () => {
    const values = Array.from({ length: 20 }, (_, i) => 100 + Math.sin(i));
    const result = rsiWilder(values, 14);
    for (let i = 0; i < 14; i++) expect(result[i]).toBeNull();
    expect(result[14]).not.toBeNull();
  });
});

describe("macd", () => {
  it("returns a zero histogram for a perfectly flat series", () => {
    const values = new Array(40).fill(50);
    const { histogram, macdLine, signalLine } = macd(values, 12, 26, 9);
    const lastIdx = values.length - 1;
    expect(macdLine[lastIdx]).toBeCloseTo(0, 8);
    expect(signalLine[lastIdx]).toBeCloseTo(0, 8);
    expect(histogram[lastIdx]).toBeCloseTo(0, 8);
  });

  it("produces a positive MACD line when price is trending up (fast EMA above slow EMA)", () => {
    const values = Array.from({ length: 60 }, (_, i) => 100 + i * 0.5);
    const { macdLine } = macd(values, 12, 26, 9);
    const lastValue = macdLine[macdLine.length - 1];
    expect(lastValue).not.toBeNull();
    expect(lastValue as number).toBeGreaterThan(0);
  });
});

describe("bollingerBands", () => {
  it("collapses upper/middle/lower to the same value for a zero-variance (flat) series", () => {
    const values = new Array(25).fill(42);
    const { upper, middle, lower } = bollingerBands(values, 20, 2);
    expect(middle[19]).toBeCloseTo(42, 10);
    expect(upper[19]).toBeCloseTo(42, 10);
    expect(lower[19]).toBeCloseTo(42, 10);
  });

  it("widens bands around the mean proportional to k * stdDev", () => {
    // Known small population: [2,4,4,4,5,5,7,9] has stdDev = 2 (population).
    const values = [2, 4, 4, 4, 5, 5, 7, 9];
    const { upper, middle, lower } = bollingerBands(values, 8, 1);
    expect(middle[7]).toBeCloseTo(5, 10);
    expect(upper[7]).toBeCloseTo(7, 10); // mean + 1*stdDev = 5 + 2
    expect(lower[7]).toBeCloseTo(3, 10); // mean - 1*stdDev = 5 - 2
  });
});

describe("atrWilder", () => {
  it("returns null before enough history, then a positive value once seeded", () => {
    const highs = Array.from({ length: 20 }, (_, i) => 110 + i);
    const lows = Array.from({ length: 20 }, (_, i) => 100 + i);
    const closes = Array.from({ length: 20 }, (_, i) => 105 + i);
    const result = atrWilder(highs, lows, closes, 14);
    for (let i = 0; i <= 13; i++) expect(result[i]).toBeNull();
    expect(result[14]).not.toBeNull();
    expect(result[14] as number).toBeGreaterThan(0);
  });

  it("throws if input arrays have mismatched lengths", () => {
    expect(() => atrWilder([1, 2, 3], [1, 2], [1, 2, 3], 1)).toThrow();
  });
});

describe("historicalVolatility", () => {
  it("returns 0 for a perfectly flat (zero-return) series", () => {
    const closes = new Array(30).fill(100);
    expect(historicalVolatility(closes, 252)).toBe(0);
  });

  it("returns a positive value for a series with actual variance", () => {
    const closes = [100, 102, 99, 105, 98, 110, 95, 108];
    expect(historicalVolatility(closes, 252)).toBeGreaterThan(0);
  });
});

import { describe, expect, it } from "vitest";
import { scoreSentiment } from "../src/sentiment.js";

describe("scoreSentiment", () => {
  it("scores an unambiguously positive headline as positive", () => {
    const result = scoreSentiment("Company profits surge as revenue growth beats expectations");
    expect(result.score).toBeGreaterThan(0);
    expect(["positive", "very-positive"]).toContain(result.sentiment);
    expect(result.matchedPositive.length).toBeGreaterThan(0);
  });

  it("scores an unambiguously negative headline as negative", () => {
    const result = scoreSentiment("Company shares plunge after lawsuit and fraud investigation");
    expect(result.score).toBeLessThan(0);
    expect(["negative", "very-negative"]).toContain(result.sentiment);
    expect(result.matchedNegative.length).toBeGreaterThan(0);
  });

  it("scores neutral text with no sentiment words as neutral with score 0", () => {
    const result = scoreSentiment("The quarterly meeting is scheduled for next Tuesday");
    expect(result.score).toBe(0);
    expect(result.sentiment).toBe("neutral");
  });

  it("handles negation: 'not profitable' should count as negative, not positive", () => {
    const result = scoreSentiment("The division is not profitable this quarter");
    expect(result.score).toBeLessThan(0);
    expect(result.matchedNegative.some((m) => m.includes("profitable"))).toBe(true);
  });

  it("handles negation: 'no losses' should count as positive, not negative", () => {
    const result = scoreSentiment("The company reported no losses this year");
    expect(result.score).toBeGreaterThan(0);
    expect(result.matchedPositive.some((m) => m.includes("losses"))).toBe(true);
  });

  it("clamps the normalized score to [-1, 1]", () => {
    const result = scoreSentiment("surge surge surge surge crash");
    expect(result.score).toBeGreaterThanOrEqual(-1);
    expect(result.score).toBeLessThanOrEqual(1);
  });

  it("is always labeled EXPERIMENTAL", () => {
    const result = scoreSentiment("neutral text");
    expect(result.honestyLabel).toBe("EXPERIMENTAL");
  });

  it("is case-insensitive", () => {
    const upper = scoreSentiment("STOCK SURGES ON STRONG EARNINGS");
    const lower = scoreSentiment("stock surges on strong earnings");
    expect(upper.score).toBe(lower.score);
  });
});

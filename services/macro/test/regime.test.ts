import { describe, expect, it } from "vitest";
import { classifyTrend, classifyRateRegime, classifyInflationRegime } from "../src/regime.js";
import type { MacroObservation } from "@fintel/data-acquisition";

function obs(seriesId: string, values: (number | null)[]): MacroObservation[] {
  return values.map((value, i) => ({ seriesId, dateMs: i * 86_400_000, value }));
}

describe("classifyTrend", () => {
  it("classifies a clearly rising series as rising", () => {
    const result = classifyTrend(obs("TEST", [100, 102, 105, 108, 112, 120]));
    expect(result.direction).toBe("rising");
    expect(result.changeAbsolute).toBeCloseTo(20, 10);
  });

  it("classifies a clearly falling series as falling", () => {
    const result = classifyTrend(obs("TEST", [120, 115, 110, 105, 100, 95]));
    expect(result.direction).toBe("falling");
  });

  it("classifies a nearly-flat series (within threshold) as flat", () => {
    const result = classifyTrend(obs("TEST", [100, 100.1, 99.9, 100.2, 100, 100.05]), 6, 0.01);
    expect(result.direction).toBe("flat");
  });

  it("ignores null observations when building the window", () => {
    const result = classifyTrend(obs("TEST", [100, null, null, 110, null, 120]));
    expect(result.windowObservations).toBe(3); // only the 3 non-null values
    expect(result.direction).toBe("rising");
  });

  it("returns flat with null changePct when fewer than 2 non-null observations exist", () => {
    const result = classifyTrend(obs("TEST", [null, null, 100]));
    expect(result.direction).toBe("flat");
    expect(result.changePct).toBeNull();
  });

  it("computes changePct correctly relative to the first value in the window", () => {
    const result = classifyTrend(obs("TEST", [100, 110]));
    expect(result.changePct).toBeCloseTo(0.1, 10);
  });

  it("is always labeled EXPERIMENTAL", () => {
    const result = classifyTrend(obs("TEST", [100, 110]));
    expect(result.honestyLabel).toBe("EXPERIMENTAL");
  });
});

describe("classifyRateRegime", () => {
  it("classifies a clearly rising Fed Funds rate as hiking", () => {
    expect(classifyRateRegime(obs("FEDFUNDS", [1.0, 1.5, 2.0, 2.5, 3.0, 3.5]))).toBe("hiking");
  });

  it("classifies a clearly falling Fed Funds rate as cutting", () => {
    expect(classifyRateRegime(obs("FEDFUNDS", [5.0, 4.5, 4.0, 3.5, 3.0, 2.5]))).toBe("cutting");
  });

  it("classifies a stable Fed Funds rate as holding", () => {
    expect(classifyRateRegime(obs("FEDFUNDS", [4.25, 4.25, 4.25, 4.25, 4.25, 4.25]))).toBe("holding");
  });
});

describe("classifyInflationRegime", () => {
  it("classifies rising CPI as inflationary", () => {
    expect(classifyInflationRegime(obs("CPIAUCSL", [280, 282, 284, 286, 288, 290]))).toBe("inflationary");
  });

  it("classifies falling CPI as disinflationary", () => {
    expect(classifyInflationRegime(obs("CPIAUCSL", [300, 298, 296, 294, 292, 290]))).toBe("disinflationary");
  });

  it("classifies stable CPI as stable", () => {
    expect(classifyInflationRegime(obs("CPIAUCSL", [290.0, 290.05, 290.1, 290.02, 290.08, 290.1]))).toBe("stable");
  });
});

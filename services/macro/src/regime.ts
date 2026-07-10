/**
 * Macro regime tagging — [EXPERIMENTAL] heuristic trend classifiers, NOT an
 * economic model. Real regime identification (e.g. NBER recession dating)
 * involves committees of economists synthesizing many indicators with
 * significant judgment and lag; this module does none of that. It only
 * answers a narrow, mechanical question: "is this single series trending up,
 * down, or flat over the recent window?" — useful as one input, never a
 * standalone macro call.
 */
import type { MacroObservation } from "@fintel/data-acquisition";

export type TrendDirection = "rising" | "falling" | "flat";

export interface TrendResult {
  readonly direction: TrendDirection;
  readonly changeAbsolute: number;
  readonly changePct: number | null; // null if starting value is zero (pct change undefined)
  readonly windowObservations: number;
  readonly honestyLabel: "EXPERIMENTAL";
}

/**
 * Classifies the trend of a series over its most recent `windowSize`
 * observations (excluding nulls) by comparing the first and last values in
 * the window. `flatThresholdPct` (default 1%) is the band within which a
 * change is considered noise rather than a real trend.
 */
export function classifyTrend(observations: readonly MacroObservation[], windowSize = 6, flatThresholdPct = 0.01): TrendResult {
  const nonNull = observations.filter((o) => o.value !== null).slice(-windowSize) as Array<{ dateMs: number; value: number }>;

  if (nonNull.length < 2) {
    return {
      direction: "flat",
      changeAbsolute: 0,
      changePct: null,
      windowObservations: nonNull.length,
      honestyLabel: "EXPERIMENTAL",
    };
  }

  const first = nonNull[0]!.value;
  const last = nonNull[nonNull.length - 1]!.value;
  const changeAbsolute = last - first;
  const changePct = first !== 0 ? changeAbsolute / Math.abs(first) : null;

  let direction: TrendDirection = "flat";
  if (changePct !== null) {
    if (changePct > flatThresholdPct) direction = "rising";
    else if (changePct < -flatThresholdPct) direction = "falling";
  } else if (changeAbsolute !== 0) {
    // Fallback when pct is undefined (starting value is exactly zero): use absolute change sign.
    direction = changeAbsolute > 0 ? "rising" : "falling";
  }

  return {
    direction,
    changeAbsolute,
    changePct,
    windowObservations: nonNull.length,
    honestyLabel: "EXPERIMENTAL",
  };
}

export type RateRegime = "hiking" | "cutting" | "holding";
export type InflationRegime = "inflationary" | "disinflationary" | "stable";

export function classifyRateRegime(fedFundsObservations: readonly MacroObservation[], windowSize = 6): RateRegime {
  const trend = classifyTrend(fedFundsObservations, windowSize, 0.02); // 2% relative move threshold for a policy rate
  if (trend.direction === "rising") return "hiking";
  if (trend.direction === "falling") return "cutting";
  return "holding";
}

export function classifyInflationRegime(cpiObservations: readonly MacroObservation[], windowSize = 6): InflationRegime {
  const trend = classifyTrend(cpiObservations, windowSize, 0.005);
  if (trend.direction === "rising") return "inflationary";
  if (trend.direction === "falling") return "disinflationary";
  return "stable";
}

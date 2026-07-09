/**
 * Strategy interface — the pluggable unit the Signal Engine composes over.
 * Every strategy MUST:
 *   - Derive confidence from data quality (never invent confidence)
 *   - Attach an honesty label; NEW strategies default to "HYPOTHESIS" until they
 *     have been validated out-of-sample by the (future) Backtest Engine — no
 *     strategy in this milestone is labeled "ESTABLISHED" because that engine
 *     does not exist yet, and claiming validation without it would be dishonest.
 */
import type { Bar, Signal, SignalDirection } from "@fintel/domain";
import type { DerivedProvenance } from "@fintel/provenance";

export interface StrategyInput {
  readonly instrumentId: string;
  readonly bars: readonly Bar[]; // ascending by bucketStartMs, same timeframe
}

export interface StrategyRawOutput {
  readonly direction: SignalDirection;
  readonly score: number; // [-1, 1]
  readonly rationale: string;
}

export interface Strategy {
  readonly strategyId: string;
  readonly version: string;
  readonly honestyLabel: Signal["honestyLabel"];
  readonly minimumBars: number;
  evaluate(input: StrategyInput): StrategyRawOutput | undefined; // undefined = insufficient data / no opinion
}

/**
 * Confidence is a function of (a) how much history backs the computation and
 * (b) the worst data-quality tag among the inputs. This is a simple, transparent,
 * documented heuristic — NOT a calibrated probability (that requires the Backtest
 * Engine's reliability-curve calibration, a follow-on milestone). Confidence is
 * therefore deliberately capped well below 1.0 in this milestone.
 */
const QUALITY_CONFIDENCE_CEILING: Record<string, number> = {
  realtime: 0.65,
  delayed: 0.55,
  eod: 0.5,
  estimated: 0.35,
  stale: 0.25,
  unknown: 0.15,
};

export function computeConfidence(barsUsed: number, minimumBars: number, provenance: DerivedProvenance): number {
  const dataSufficiencyFactor = Math.min(1, barsUsed / (minimumBars * 2)); // saturates once we have 2x the minimum history
  const ceiling = QUALITY_CONFIDENCE_CEILING[provenance.quality] ?? 0.15;
  return Math.round(dataSufficiencyFactor * ceiling * 1000) / 1000;
}

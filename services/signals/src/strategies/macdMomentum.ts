/**
 * MACD Momentum — bullish when the MACD histogram is positive and rising
 * (accelerating upward momentum), bearish when negative and falling. A second,
 * independent momentum heuristic distinct from the EMA/RSI trend strategy, so
 * the two can be compared/ensembled honestly rather than being redundant.
 */
import { decimalStringsToNumbers, macd } from "@fintel/technical-analysis";
import type { Strategy, StrategyInput, StrategyRawOutput } from "../strategy.js";

export function createMacdMomentumStrategy(
  opts: { fastPeriod?: number; slowPeriod?: number; signalPeriod?: number } = {},
): Strategy {
  const fastPeriod = opts.fastPeriod ?? 12;
  const slowPeriod = opts.slowPeriod ?? 26;
  const signalPeriod = opts.signalPeriod ?? 9;
  const minimumBars = slowPeriod + signalPeriod + 2; // +2 so we can compare histogram slope

  return {
    strategyId: "macd-momentum",
    version: "1.0.0",
    honestyLabel: "HYPOTHESIS",
    minimumBars,
    evaluate(input: StrategyInput): StrategyRawOutput | undefined {
      if (input.bars.length < minimumBars) return undefined;
      const closes = decimalStringsToNumbers(input.bars.map((b) => b.close));
      const { histogram } = macd(closes, fastPeriod, slowPeriod, signalPeriod);

      const lastIdx = closes.length - 1;
      const current = histogram[lastIdx];
      const previous = histogram[lastIdx - 1];
      if (current == null || previous == null) return undefined;

      const rising = current > previous;
      const score = Math.max(-1, Math.min(1, current / (Math.abs(previous) + 1e-9) - 1));

      if (current > 0 && rising) {
        return {
          direction: "long",
          score: Math.min(1, Math.abs(score) + 0.2),
          rationale:
            `MACD(${fastPeriod},${slowPeriod},${signalPeriod}) histogram is positive (${current.toFixed(4)}) ` +
            `and rising from ${previous.toFixed(4)} — accelerating bullish momentum. ` +
            `[HYPOTHESIS: not yet validated out-of-sample.]`,
        };
      }
      if (current < 0 && !rising) {
        return {
          direction: "short",
          score: Math.min(1, Math.abs(score) + 0.2),
          rationale:
            `MACD(${fastPeriod},${slowPeriod},${signalPeriod}) histogram is negative (${current.toFixed(4)}) ` +
            `and falling from ${previous.toFixed(4)} — accelerating bearish momentum. ` +
            `[HYPOTHESIS: not yet validated out-of-sample.]`,
        };
      }
      return {
        direction: "flat",
        score: 0,
        rationale: `MACD histogram (${current.toFixed(4)}) does not show clear accelerating momentum in either direction.`,
      };
    },
  };
}

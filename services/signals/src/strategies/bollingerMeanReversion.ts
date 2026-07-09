/**
 * Bollinger Mean-Reversion — bullish when price closes below the lower band
 * (statistically stretched to the downside, expecting reversion toward the mean),
 * bearish when above the upper band. This is the opposite philosophy from the
 * trend-following strategies (mean-reversion vs. momentum) — deliberately included
 * so the platform's Signal Board can show genuinely disagreeing strategies rather
 * than three restatements of the same idea.
 */
import { bollingerBands, decimalStringsToNumbers } from "@fintel/technical-analysis";
import type { Strategy, StrategyInput, StrategyRawOutput } from "../strategy.js";

export function createBollingerMeanReversionStrategy(opts: { period?: number; k?: number } = {}): Strategy {
  const period = opts.period ?? 20;
  const k = opts.k ?? 2;
  const minimumBars = period + 1;

  return {
    strategyId: "bollinger-mean-reversion",
    version: "1.0.0",
    honestyLabel: "HYPOTHESIS",
    minimumBars,
    evaluate(input: StrategyInput): StrategyRawOutput | undefined {
      if (input.bars.length < minimumBars) return undefined;
      const closes = decimalStringsToNumbers(input.bars.map((b) => b.close));
      const { upper, lower, middle } = bollingerBands(closes, period, k);

      const lastIdx = closes.length - 1;
      const price = closes[lastIdx]!;
      const upperBand = upper[lastIdx];
      const lowerBand = lower[lastIdx];
      const middleBand = middle[lastIdx];
      if (upperBand == null || lowerBand == null || middleBand == null) return undefined;

      const bandWidth = upperBand - lowerBand;
      if (bandWidth === 0) {
        return { direction: "flat", score: 0, rationale: "Bollinger bands have zero width (no recent volatility)." };
      }

      if (price < lowerBand) {
        const overshoot = (lowerBand - price) / bandWidth;
        return {
          direction: "long",
          score: Math.min(1, overshoot * 2),
          rationale:
            `Price ${price.toFixed(4)} is below the lower Bollinger band ${lowerBand.toFixed(4)} ` +
            `(period=${period}, k=${k}) — statistically stretched to the downside, expecting reversion toward ` +
            `the ${period}-period mean ${middleBand.toFixed(4)}. [HYPOTHESIS: mean-reversion assumption, not yet ` +
            `validated out-of-sample; can fail badly in strong trends.]`,
        };
      }
      if (price > upperBand) {
        const overshoot = (price - upperBand) / bandWidth;
        return {
          direction: "short",
          score: Math.min(1, overshoot * 2),
          rationale:
            `Price ${price.toFixed(4)} is above the upper Bollinger band ${upperBand.toFixed(4)} ` +
            `(period=${period}, k=${k}) — statistically stretched to the upside, expecting reversion toward ` +
            `the ${period}-period mean ${middleBand.toFixed(4)}. [HYPOTHESIS: mean-reversion assumption, not yet ` +
            `validated out-of-sample; can fail badly in strong trends.]`,
        };
      }
      return {
        direction: "flat",
        score: 0,
        rationale: `Price ${price.toFixed(4)} is within Bollinger bands [${lowerBand.toFixed(4)}, ${upperBand.toFixed(4)}] — no reversion signal.`,
      };
    },
  };
}

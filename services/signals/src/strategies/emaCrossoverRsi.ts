/**
 * EMA Crossover + RSI Filter — a classic trend-following heuristic:
 *   - Bullish bias when fast EMA > slow EMA (uptrend) AND RSI is not overbought (<70)
 *   - Bearish bias when fast EMA < slow EMA (downtrend) AND RSI is not oversold (>30)
 *   - Flat/no-opinion otherwise (e.g. RSI extreme against the trend direction)
 * This is a well-known, simple, EXPLAINABLE rule — not a claim of edge. Labeled
 * HYPOTHESIS until validated out-of-sample by the Backtest Engine (follow-on milestone).
 */
import { decimalStringsToNumbers, ema, rsiWilder } from "@fintel/technical-analysis";
import type { Strategy, StrategyInput, StrategyRawOutput } from "../strategy.js";

export function createEmaCrossoverRsiStrategy(opts: { fastPeriod?: number; slowPeriod?: number; rsiPeriod?: number } = {}): Strategy {
  const fastPeriod = opts.fastPeriod ?? 12;
  const slowPeriod = opts.slowPeriod ?? 26;
  const rsiPeriod = opts.rsiPeriod ?? 14;
  const minimumBars = slowPeriod + rsiPeriod;

  return {
    strategyId: "ema-crossover-rsi-filter",
    version: "1.0.0",
    honestyLabel: "HYPOTHESIS",
    minimumBars,
    evaluate(input: StrategyInput): StrategyRawOutput | undefined {
      if (input.bars.length < minimumBars) return undefined;
      const closes = decimalStringsToNumbers(input.bars.map((b) => b.close));

      const fastEma = ema(closes, fastPeriod);
      const slowEma = ema(closes, slowPeriod);
      const rsi = rsiWilder(closes, rsiPeriod);

      const lastIdx = closes.length - 1;
      const fast = fastEma[lastIdx];
      const slow = slowEma[lastIdx];
      const rsiValue = rsi[lastIdx];
      if (fast == null || slow == null || rsiValue == null) return undefined;

      const emaSpreadPct = (fast - slow) / slow;
      const trendUp = fast > slow;
      const trendDown = fast < slow;

      if (trendUp && rsiValue < 70) {
        const score = Math.max(-1, Math.min(1, emaSpreadPct * 10)); // scaled heuristic, capped to [-1,1]
        return {
          direction: "long",
          score: Math.abs(score),
          rationale:
            `Fast EMA(${fastPeriod})=${fast.toFixed(4)} above slow EMA(${slowPeriod})=${slow.toFixed(4)} ` +
            `(spread ${(emaSpreadPct * 100).toFixed(2)}%); RSI(${rsiPeriod})=${rsiValue.toFixed(1)} is not overbought (<70). ` +
            `[HYPOTHESIS: classic trend-following heuristic, not yet validated out-of-sample.]`,
        };
      }
      if (trendDown && rsiValue > 30) {
        const score = Math.max(-1, Math.min(1, emaSpreadPct * 10));
        return {
          direction: "short",
          score: Math.abs(score),
          rationale:
            `Fast EMA(${fastPeriod})=${fast.toFixed(4)} below slow EMA(${slowPeriod})=${slow.toFixed(4)} ` +
            `(spread ${(emaSpreadPct * 100).toFixed(2)}%); RSI(${rsiPeriod})=${rsiValue.toFixed(1)} is not oversold (>30). ` +
            `[HYPOTHESIS: classic trend-following heuristic, not yet validated out-of-sample.]`,
        };
      }
      return {
        direction: "flat",
        score: 0,
        rationale: `No clear trend/RSI alignment: EMA trend ${trendUp ? "up" : trendDown ? "down" : "flat"}, RSI=${rsiValue.toFixed(1)}.`,
      };
    },
  };
}

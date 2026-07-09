import { createHash } from "node:crypto";
import type { Signal } from "@fintel/domain";
import { epochMillis } from "@fintel/money-time";
import { deriveProvenance, worstQuality } from "@fintel/provenance";
import { computeConfidence, type Strategy, type StrategyInput } from "./strategy.js";
import { createEmaCrossoverRsiStrategy } from "./strategies/emaCrossoverRsi.js";
import { createMacdMomentumStrategy } from "./strategies/macdMomentum.js";
import { createBollingerMeanReversionStrategy } from "./strategies/bollingerMeanReversion.js";

export * from "./strategy.js";
export * from "./strategies/emaCrossoverRsi.js";
export * from "./strategies/macdMomentum.js";
export * from "./strategies/bollingerMeanReversion.js";

export class SignalEngine {
  private readonly strategies: Strategy[];

  constructor(strategies?: readonly Strategy[]) {
    this.strategies =
      strategies !== undefined
        ? [...strategies]
        : [createEmaCrossoverRsiStrategy(), createMacdMomentumStrategy(), createBollingerMeanReversionStrategy()];
  }

  registerStrategy(strategy: Strategy): void {
    this.strategies.push(strategy);
  }

  listStrategies(): readonly Strategy[] {
    return this.strategies;
  }

  /** Runs every registered strategy against the given bar history and returns one Signal per strategy that had an opinion. */
  evaluateAll(input: StrategyInput): Signal[] {
    const signals: Signal[] = [];
    const now = Date.now();

    for (const strategy of this.strategies) {
      const raw = strategy.evaluate(input);
      if (!raw) continue;

      const inputProvenance = input.bars.map((b) => b.provenance);
      const derived = deriveProvenance(inputProvenance, `${strategy.strategyId}@${strategy.version}`, now);
      const confidence = computeConfidence(input.bars.length, strategy.minimumBars, derived);

      const signalId = createHash("sha256")
        .update(`${input.instrumentId}|${strategy.strategyId}|${now}`)
        .digest("hex")
        .slice(0, 24);

      signals.push({
        signalId,
        instrumentId: input.instrumentId,
        strategyId: `${strategy.strategyId}@${strategy.version}`,
        direction: raw.direction,
        score: raw.score,
        confidence,
        rationale:
          raw.rationale +
          ` [Confidence bounded by input data quality: ${worstQuality(inputProvenance.map((p) => p.quality))}.]`,
        honestyLabel: strategy.honestyLabel,
        generatedAtMs: epochMillis(now),
        provenance: derived,
      });
    }
    return signals;
  }
}

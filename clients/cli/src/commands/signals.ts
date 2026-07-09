import { createFintelCore } from "@fintel/core";
import { Timeframe } from "@fintel/money-time";
import { resolveInstrument } from "../resolveInstrument.js";
import { formatDirection, formatQuality, style } from "../ui/terminal.js";

export interface SignalsOptions {
  readonly timeframe?: string;
  readonly json?: boolean;
}

export async function runSignalsCommand(symbol: string, opts: SignalsOptions): Promise<void> {
  const core = createFintelCore();
  try {
    const instrument = await resolveInstrument(core, symbol);
    const timeframe = (opts.timeframe as Timeframe) ?? Timeframe.D1;

    const bars = await core.marketData.getBars(instrument, timeframe);
    const signals = core.signals.evaluateAll({ instrumentId: instrument.instrumentId, bars });
    for (const s of signals) await core.persistence.signals.insert(s);

    if (opts.json) {
      console.log(JSON.stringify(signals, null, 2));
      return;
    }

    console.log(`${style.bold(instrument.displayName)} (${instrument.instrumentId}) — ${timeframe}`);
    if (signals.length === 0) {
      console.log(
        style.dim(
          "  No strategies produced a signal (insufficient bar history for at least one strategy's minimum window).",
        ),
      );
      return;
    }
    for (const s of signals) {
      console.log(
        `  [${formatDirection(s.direction)}] ${style.bold(s.strategyId)}  score=${s.score.toFixed(3)}  ` +
          `confidence=${s.confidence.toFixed(3)}  label=${style.yellow(s.honestyLabel)}`,
      );
      console.log(`      ${style.dim(s.rationale)}`);
    }
    console.log(
      style.dim(
        `\n  ${signals.length} strategies evaluated. Confidence values are bounded by input data quality and are ` +
          `NOT calibrated probabilities (that requires out-of-sample backtest validation — a follow-on milestone). ` +
          `All signals are labeled HYPOTHESIS: advisory analytics only, not financial advice.`,
      ),
    );
  } finally {
    core.close();
  }
}

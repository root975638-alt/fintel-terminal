import { createFintelCore } from "@fintel/core";
import { Timeframe } from "@fintel/money-time";
import { decimalStringsToNumbers } from "@fintel/technical-analysis";
import { resolveInstrument } from "../resolveInstrument.js";
import { formatQuality, sparkline, style, terminalWidth } from "../ui/terminal.js";

export interface ChartOptions {
  readonly timeframe?: string;
  readonly bars?: string;
  readonly json?: boolean;
}

const TIMEFRAME_VALUES = new Set(Object.values(Timeframe) as string[]);

export async function runChartCommand(symbol: string, opts: ChartOptions): Promise<void> {
  const core = createFintelCore();
  try {
    const instrument = await resolveInstrument(core, symbol);
    const timeframeArg = opts.timeframe ?? "1d";
    if (!TIMEFRAME_VALUES.has(timeframeArg)) {
      throw new Error(`Unknown timeframe "${timeframeArg}". Valid values: ${[...TIMEFRAME_VALUES].join(", ")}`);
    }
    const timeframe = timeframeArg as Timeframe;
    const barCount = opts.bars ? Number(opts.bars) : 90;

    const bars = await core.marketData.getBars(instrument, timeframe);
    const tail = bars.slice(-barCount);

    if (opts.json) {
      console.log(JSON.stringify(tail, null, 2));
      return;
    }

    if (tail.length === 0) {
      console.log(style.dim(`No bar data available yet for ${instrument.instrumentId} @ ${timeframe}.`));
      return;
    }

    const closes = decimalStringsToNumbers(tail.map((b) => b.close));
    const width = Math.min(terminalWidth() - 4, closes.length);
    const sampled = downsample(closes, width);

    const first = tail[0]!;
    const last = tail[tail.length - 1]!;
    const changePct = ((closes[closes.length - 1]! - closes[0]!) / closes[0]!) * 100;
    const changeStyled = changePct >= 0 ? style.green(`+${changePct.toFixed(2)}%`) : style.red(`${changePct.toFixed(2)}%`);

    console.log(`${style.bold(instrument.displayName)} (${instrument.instrumentId}) — ${timeframe}, last ${tail.length} bars`);
    console.log(`  ${sparkline(sampled)}`);
    console.log(
      `  From ${new Date(first.bucketStartMs).toISOString().slice(0, 10)} (${first.close}) to ` +
        `${new Date(last.bucketStartMs).toISOString().slice(0, 10)} (${last.close})  ${changeStyled}`,
    );
    console.log(`  Quality: ${formatQuality(last.provenance.quality)}  Source: ${last.provenance.source.displayName}`);
  } finally {
    core.close();
  }
}

function downsample(values: readonly number[], targetWidth: number): number[] {
  if (values.length <= targetWidth || targetWidth <= 0) return [...values];
  const bucketSize = values.length / targetWidth;
  const result: number[] = [];
  for (let i = 0; i < targetWidth; i++) {
    const start = Math.floor(i * bucketSize);
    const end = Math.max(start + 1, Math.floor((i + 1) * bucketSize));
    const slice = values.slice(start, end);
    result.push(slice.reduce((a, b) => a + b, 0) / slice.length);
  }
  return result;
}

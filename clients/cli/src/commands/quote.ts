import { createFintelCore } from "@fintel/core";
import { resolveInstrument } from "../resolveInstrument.js";
import { formatQuality, style } from "../ui/terminal.js";

export interface QuoteOptions {
  readonly json?: boolean;
}

export async function runQuoteCommand(symbol: string, opts: QuoteOptions): Promise<void> {
  const core = createFintelCore();
  try {
    const instrument = await resolveInstrument(core, symbol);
    const quote = await core.marketData.getQuote(instrument);

    if (opts.json) {
      console.log(JSON.stringify({ instrument, quote }, null, 2));
      return;
    }

    console.log(`${style.bold(instrument.displayName)} (${instrument.instrumentId})`);
    console.log(`  Last:            ${quote.last ?? "n/a"} ${instrument.currency}`);
    if (quote.bid && quote.ask) console.log(`  Bid / Ask:       ${quote.bid} / ${quote.ask}`);
    if (quote.dayHigh && quote.dayLow) console.log(`  Day High / Low:  ${quote.dayHigh} / ${quote.dayLow}`);
    if (quote.previousClose) console.log(`  Previous Close:  ${quote.previousClose}`);
    if (quote.volume) console.log(`  Volume:          ${quote.volume}`);
    console.log(`  Quality:         ${formatQuality(quote.provenance.quality)}`);
    console.log(`  Source:          ${quote.provenance.source.displayName} (${quote.provenance.source.sourceId})`);
    console.log(`  As of:           ${new Date(quote.provenance.asOfMs).toISOString()}`);
  } finally {
    core.close();
  }
}

import { createFintelCore, buildFundamentalSnapshot } from "@fintel/core";
import { resolveInstrument } from "../resolveInstrument.js";
import { style } from "../ui/terminal.js";

export interface FundamentalsOptions {
  readonly json?: boolean;
}

function fmtPct(v: number | null): string {
  return v === null ? "n/a" : `${(v * 100).toFixed(2)}%`;
}

export async function runFundamentalsCommand(symbol: string, opts: FundamentalsOptions): Promise<void> {
  const core = createFintelCore();
  try {
    const instrument = await resolveInstrument(core, symbol);
    const snapshot = await buildFundamentalSnapshot(instrument.instrumentId, core.acquisition.secEdgar);

    if (opts.json) {
      console.log(JSON.stringify(snapshot, null, 2));
      return;
    }

    console.log(`${style.bold(snapshot.entityName)} (${instrument.instrumentId}, CIK ${snapshot.cik})`);
    console.log(`  Fiscal year: ${snapshot.asOfFiscalYear ?? "n/a"} (as of ${snapshot.asOfDate ?? "n/a"})\n`);

    console.log(style.bold("  Ratios:"));
    console.log(`    Gross margin:      ${fmtPct(snapshot.ratios.grossMargin)}`);
    console.log(`    Operating margin:  ${fmtPct(snapshot.ratios.operatingMargin)}`);
    console.log(`    Net margin:        ${fmtPct(snapshot.ratios.netMargin)}`);
    console.log(`    ROE:               ${fmtPct(snapshot.ratios.roe)}`);
    console.log(`    ROA:               ${fmtPct(snapshot.ratios.roa)}`);
    console.log(`    Current ratio:     ${snapshot.ratios.currentRatio?.toFixed(2) ?? "n/a"}`);
    console.log(`    Quick ratio:       ${snapshot.ratios.quickRatio?.toFixed(2) ?? "n/a"}`);
    console.log(`    Debt/Equity:       ${snapshot.ratios.debtToEquity?.toFixed(2) ?? "n/a"}`);
    console.log(`    Revenue YoY:       ${fmtPct(snapshot.ratios.revenueYoyGrowth)}`);
    console.log(`    Net income YoY:    ${fmtPct(snapshot.ratios.netIncomeYoyGrowth)}`);

    if (snapshot.healthScores.piotroski) {
      console.log(style.bold("\n  Piotroski F-Score:"));
      console.log(`    ${snapshot.healthScores.piotroski.score}/9 [${style.yellow(snapshot.healthScores.piotroski.honestyLabel)}]`);
      console.log(style.dim(`    ${snapshot.healthScores.piotroski.interpretationNote}`));
    } else {
      console.log(style.dim("\n  Piotroski F-Score: not computed (missing required prior-year concepts)"));
    }

    if (snapshot.missingConcepts.length > 0) {
      console.log(style.yellow(`\n  Missing XBRL concepts (not fabricated, honestly omitted): ${snapshot.missingConcepts.join(", ")}`));
    }
    console.log(style.dim(`\n  ${snapshot.disclaimer}`));
  } finally {
    core.close();
  }
}

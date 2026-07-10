import { createFintelCore } from "@fintel/core";
import { style } from "../ui/terminal.js";

export interface MacroOptions {
  readonly json?: boolean;
}

export async function runMacroCommand(opts: MacroOptions): Promise<void> {
  const core = createFintelCore();
  try {
    if (!core.config.FRED_API_KEY) {
      console.error(
        style.yellow(
          "FRED_API_KEY is not configured — macro data is unavailable (explicit degraded mode, not fabricated). " +
            "Register a free key at https://fred.stlouisfed.org/docs/api/api_key.html and set FRED_API_KEY in your .env.",
        ),
      );
      process.exitCode = 1;
      return;
    }

    const snapshot = await core.macro.computeSnapshot();

    if (opts.json) {
      console.log(JSON.stringify(snapshot, null, 2));
      return;
    }

    console.log(style.bold("US Macro Snapshot"));
    console.log(`  Rate regime:       ${style.bold(snapshot.rateRegime)} (from FEDFUNDS trend)`);
    console.log(`  Inflation regime:  ${style.bold(snapshot.inflationRegime)} (from CPIAUCSL trend)`);
    console.log(`  Fetched at:        ${new Date(snapshot.fetchedAtMs).toISOString()}`);
    console.log(`  Series used:       ${snapshot.seriesFetched.join(", ")}`);
    console.log(style.dim(`\n  ${snapshot.disclaimer}`));

    console.log(style.dim("\n  Full series catalogue:"));
    for (const s of core.macro.listSeriesCatalogue()) {
      console.log(style.dim(`    ${s.seriesId} (${s.name}, ${s.typicalCadence}) — ${s.limitation}`));
    }
  } finally {
    core.close();
  }
}

#!/usr/bin/env node
import { Command } from "commander";
import { printBanner } from "./ui/disclaimer.js";
import { runQuoteCommand } from "./commands/quote.js";
import { runChartCommand } from "./commands/chart.js";
import { runSignalsCommand } from "./commands/signals.js";
import { runDoctorCommand } from "./commands/doctor.js";
import { runInitCommand } from "./commands/init.js";
import { listKnownSymbolsHelp } from "./resolveInstrument.js";

const program = new Command();

program
  .name("fintel")
  .description(
    "FINTEL-TERMINAL — free-data financial intelligence CLI (research/educational use only, not financial advice)",
  )
  .version("0.1.0");

program
  .command("init")
  .description("Initialize local config (.env) and SQLite database")
  .action(async () => {
    await runInitCommand();
  });

program
  .command("doctor")
  .description("Check environment health (Node version, DB, cache dirs, config, source registry)")
  .option("--json", "output machine-readable JSON")
  .action(async (opts) => {
    await runDoctorCommand(opts);
  });

program
  .command("quote <symbol>")
  .description(
    `Show the latest quote for a symbol. Accepts "SYMBOL" (uses CLI_DEFAULT_MARKET) or "MARKET:SYMBOL".\n\n  Known symbols:\n  ${listKnownSymbolsHelp()}`,
  )
  .option("--json", "output machine-readable JSON")
  .action(async (symbol, opts) => {
    printBanner();
    await runQuoteCommand(symbol, opts);
  });

program
  .command("chart <symbol>")
  .description("Show an ASCII sparkline chart for a symbol")
  .option("-t, --timeframe <tf>", "timeframe (1m,5m,15m,30m,1h,4h,1d,1w,1M)", "1d")
  .option("-b, --bars <n>", "number of bars to display", "90")
  .option("--json", "output raw bar data as JSON instead of rendering")
  .action(async (symbol, opts) => {
    printBanner();
    await runChartCommand(symbol, opts);
  });

program
  .command("signals <symbol>")
  .description("Run all registered strategies against a symbol and show advisory signals")
  .option("-t, --timeframe <tf>", "timeframe (1m,5m,15m,30m,1h,4h,1d,1w,1M)", "1d")
  .option("--json", "output machine-readable JSON")
  .action(async (symbol, opts) => {
    printBanner();
    await runSignalsCommand(symbol, opts);
  });

program.parseAsync(process.argv).catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`\u001b[31mError:\u001b[0m ${message}`);
  process.exitCode = 1;
});

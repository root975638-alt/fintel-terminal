#!/usr/bin/env node
import { Command } from "commander";
import { printBanner } from "./ui/disclaimer.js";
import { runQuoteCommand } from "./commands/quote.js";
import { runChartCommand } from "./commands/chart.js";
import { runSignalsCommand } from "./commands/signals.js";
import { runDoctorCommand } from "./commands/doctor.js";
import { runInitCommand } from "./commands/init.js";
import { runBacktestCommand } from "./commands/backtest.js";
import { runFundamentalsCommand } from "./commands/fundamentals.js";
import { runNewsCommand } from "./commands/news.js";
import { runMacroCommand } from "./commands/macro.js";
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

program
  .command("backtest <symbol>")
  .description("Run a walk-forward (in-sample/out-of-sample) backtest of a strategy and show honest performance metrics")
  .option("-t, --timeframe <tf>", "timeframe (1m,5m,15m,30m,1h,4h,1d,1w,1M)", "1d")
  .option("-s, --strategy <id>", "strategy id (default: first registered strategy)")
  .option("--json", "output machine-readable JSON")
  .action(async (symbol, opts) => {
    printBanner();
    await runBacktestCommand(symbol, opts);
  });

program
  .command("fundamentals <symbol>")
  .description("Show fundamental ratios and health scores from SEC EDGAR (US equities only)")
  .option("--json", "output machine-readable JSON")
  .action(async (symbol, opts) => {
    printBanner();
    await runFundamentalsCommand(symbol, opts);
  });

program
  .command("news")
  .description("Show recent financial news with sentiment scoring and entity linking")
  .option("--symbol <instrumentId>", "filter to news related to a specific instrument")
  .option("-l, --limit <n>", "number of items to show", "20")
  .option("--json", "output machine-readable JSON")
  .action(async (opts) => {
    printBanner();
    await runNewsCommand(opts);
  });

program
  .command("macro")
  .description("Show US macro regime snapshot (rate + inflation trend) from FRED (requires FRED_API_KEY)")
  .option("--json", "output machine-readable JSON")
  .action(async (opts) => {
    printBanner();
    await runMacroCommand(opts);
  });

program.parseAsync(process.argv).catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`\u001b[31mError:\u001b[0m ${message}`);
  process.exitCode = 1;
});

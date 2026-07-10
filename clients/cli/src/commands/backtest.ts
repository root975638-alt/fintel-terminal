import { createFintelCore, runExperiment } from "@fintel/core";
import { Timeframe } from "@fintel/money-time";
import { resolveInstrument } from "../resolveInstrument.js";
import { style } from "../ui/terminal.js";

export interface BacktestOptions {
  readonly timeframe?: string;
  readonly strategy?: string;
  readonly json?: boolean;
}

function fmtPct(v: number | null): string {
  if (v === null) return "n/a";
  const s = `${(v * 100).toFixed(2)}%`;
  return v >= 0 ? style.green(s) : style.red(s);
}

function fmtRatio(v: number | null): string {
  return v === null ? "n/a" : v.toFixed(3);
}

export async function runBacktestCommand(symbol: string, opts: BacktestOptions): Promise<void> {
  const core = createFintelCore();
  try {
    const instrument = await resolveInstrument(core, symbol);
    const timeframe = (opts.timeframe as Timeframe) ?? Timeframe.D1;
    const bars = await core.marketData.getBars(instrument, timeframe);

    const strategies = core.signals.listStrategies();
    const strategy = opts.strategy ? strategies.find((s) => s.strategyId === opts.strategy) : strategies[0];
    if (!strategy) {
      throw new Error(
        `Unknown strategy "${opts.strategy}". Available: ${strategies.map((s) => s.strategyId).join(", ")}`,
      );
    }

    const { runId, report, decision } = await runExperiment({
      instrumentId: instrument.instrumentId,
      bars,
      strategy,
      persistence: core.persistence,
    });

    if (opts.json) {
      console.log(JSON.stringify({ runId, report, decision }, null, 2));
      return;
    }

    console.log(
      `${style.bold(instrument.displayName)} (${instrument.instrumentId}) — walk-forward backtest of ${style.bold(strategy.strategyId)}`,
    );
    console.log(style.dim("NOT FINANCIAL ADVICE. Backtest results, even positive ones, do not guarantee future performance.\n"));

    const printSegment = (label: string, seg: typeof report.inSample) => {
      console.log(style.bold(`  ${label} (${seg.barCount} bars, ${seg.metrics.sampleSize} trades):`));
      console.log(`    Total return:     ${fmtPct(seg.metrics.totalReturnPct)}`);
      console.log(`    CAGR:             ${seg.metrics.cagr !== null ? fmtPct(seg.metrics.cagr) : "n/a (period too short)"}`);
      console.log(`    Sharpe ratio:     ${fmtRatio(seg.metrics.sharpeRatio)}`);
      console.log(`    Sortino ratio:    ${fmtRatio(seg.metrics.sortinoRatio)}`);
      console.log(`    Max drawdown:     ${(seg.metrics.maxDrawdownPct * 100).toFixed(2)}%`);
      console.log(`    Win rate:         ${seg.metrics.winRate !== null ? `${(seg.metrics.winRate * 100).toFixed(1)}%` : "n/a"} (sample size: ${seg.metrics.sampleSize})`);
      console.log(`    Profit factor:    ${fmtRatio(seg.metrics.profitFactor)}`);
      console.log(`    Expectancy/trade: ${seg.metrics.expectancyPerTrade !== null ? seg.metrics.expectancyPerTrade.toFixed(2) : "n/a"}`);
      for (const w of seg.run.warnings) console.log(style.yellow(`    WARNING [${w.code}]: ${w.message}`));
    };

    printSegment("IN-SAMPLE", report.inSample);
    console.log();
    printSegment("OUT-OF-SAMPLE", report.outOfSample);

    console.log(
      `\n  OOS holds up: ${report.oosHoldsUp === null ? style.yellow("insufficient data to judge") : report.oosHoldsUp ? style.green("yes") : style.red("no")}`,
    );
    console.log(`  Honest label decision: ${style.bold(decision.label)}`);
    for (const r of decision.reasons) console.log(style.dim(`    - ${r}`));
    console.log(style.dim(`\n  Run recorded as ${runId} (visible in future runs' promotion history).`));
  } finally {
    core.close();
  }
}

# 016 — Backtest Engine

## Purpose

Provide a deterministic, leakage-free, cost-aware backtest so that a
strategy's `HYPOTHESIS` label can only ever move to something stronger
(`EXPERIMENTAL`, eventually `ESTABLISHED`) on the basis of genuine
out-of-sample evidence — never by assertion.

## Architecture

```
services/backtest/src/
  costs.ts        Spread + slippage + commission cost model (bps-based)
  types.ts        BacktestConfig, SimulatedTrade, EquityPoint (simulation-only types)
  engine.ts        Deterministic event-driven engine with the leakage guard
  metrics.ts        Sharpe/Sortino/drawdown/win-rate/profit-factor/expectancy
  walkForward.ts    IS/OOS split + independent re-run + oosHoldsUp verdict
```

## The leakage guard (the single most important property)

At simulated bar index `i`, the strategy is evaluated using **only**
`bars[windowStart..i]` (a bounded trailing window, never `bars[i+1..]`). This
is enforced structurally — the slice is computed once per step and the
strategy has no reference to any later bar — and is directly asserted by
`test/leakageGuard.test.ts`, which uses a spy strategy that records every bar
timestamp it was ever shown and checks none exceed the "current" bar.

The window is bounded (`lookbackWindowBars`, default
`max(strategy.minimumBars * 3, 100)`) rather than growing from bar 0, both to
avoid O(n^2) blowup on long backtests and because it mirrors what a live
strategy would actually see — a live system doesn't have unbounded growing
history either.

## Cost model (`CONFIG DEFAULT — verify for your instrument/venue`)

| Parameter | Default | Rationale |
|---|---|---|
| `spreadBps` | 5 (0.05%) | Conservative default half-spread |
| `slippageBps` | 3 (0.03%) | Imperfect fill vs. quoted price |
| `commissionBps` | 2 (0.02%) | Typical low-cost venue commission |

Costs are applied on **both entry and exit** of every simulated trade. Omitting
costs is a common, non-obvious way a backtest becomes dishonest even without
literally fabricating a number — this engine never runs cost-free.

## Metrics (every one reports sample size + period + assumptions, per spec)

`computeMetrics()` returns `totalReturnPct`, `cagr` (null if period < 30 days),
`sharpeRatio`/`sortinoRatio` (null if fewer than 2 return observations),
`maxDrawdownPct`, `winRate` (null if zero trades), `profitFactor` (null if no
losing trades — an undefined ratio, never reported as `Infinity`),
`expectancyPerTrade`, `turnover`, and **always** `sampleSize`, `periodDays`,
and `assumptions` (risk-free rate, cost model, annualization basis) alongside.
No caller may display a headline ratio without these.

## Walk-forward IS/OOS split

`runWalkForwardBacktest()` splits the bar history into a contiguous
in-sample (IS) segment followed by an out-of-sample (OOS) segment
(`inSampleFraction`, default 0.7), and runs the engine on **each
independently** — separate starting capital, separate state. The OOS segment
sees **only its own bars**, no warmup borrowed from IS — the simpler,
unambiguously leakage-free choice, at the cost of potentially fewer OOS
trades if the strategy needs a long warmup (surfaced honestly via
`INSUFFICIENT_HISTORY`/`LOW_SAMPLE_SIZE` warnings, never padded silently).

`oosHoldsUp` is `null` when OOS has fewer than 10 trades (too few to judge at
all), otherwise `true`/`false` based on whether OOS total return and Sharpe
are both positive. This is a coarse pre-check, not the actual promotion
decision — see `017_QUANT_RESEARCH_ENGINE.md`.

## Honest results from this milestone (not fabricated, not cherry-picked)

Running all 3 Milestone-1 strategies against real BTC and ETH daily data
(Binance, most recent ~1000 daily bars, 70/30 IS/OOS split):

| Instrument | Strategy | IS trades / return / Sharpe | OOS trades / return / Sharpe | OOS holds up? |
|---|---|---|---|---|
| BTC | ema-crossover-rsi-filter | 40 / +1.97% / 0.22 | 15 / +1.56% / 0.50 | yes (but too few OOS trades to matter) |
| BTC | macd-momentum | 118 / -3.01% / -0.36 | 47 / -0.95% / -0.29 | no |
| BTC | bollinger-mean-reversion | 43 / -0.21% / -0.04 | 15 / -0.78% / -0.34 | no |
| ETH | ema-crossover-rsi-filter | 39 / +3.72% / 0.30 | 13 / +0.44% / 0.12 | yes (but too few OOS trades to matter) |
| ETH | macd-momentum | 108 / -2.27% / -0.17 | 42 / -0.15% / -0.02 | no |
| ETH | bollinger-mean-reversion | 43 / -2.57% / -0.36 | 14 / 0.00% / 0.01 | yes (but too few OOS trades to matter) |

**Every single run remained labeled `HYPOTHESIS`.** None of the 6
strategy/instrument combinations cleared the `EXPERIMENTAL` bar:
`macd-momentum` has enough OOS trades (42-47) to be statistically
meaningful, but loses money out-of-sample on both instruments.
`ema-crossover-rsi-filter` and `bollinger-mean-reversion` occasionally show
positive OOS returns, but with only 13-15 OOS trades — well below the
`MIN_OOS_TRADES_FOR_EXPERIMENTAL = 30` threshold — so no conclusion can
honestly be drawn either way. This is exactly the intended, honest outcome:
**simple TA heuristics do not automatically constitute a validated trading
edge**, and this platform will not claim otherwise without real evidence.

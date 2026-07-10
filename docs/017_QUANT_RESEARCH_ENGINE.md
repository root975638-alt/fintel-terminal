# 017 — Quant Research Engine (Promotion Criteria & Experiment Registry)

## Purpose

Define the **only** mechanism by which a strategy's `honestyLabel` may move
away from `HYPOTHESIS`, and maintain a permanent, queryable record of every
backtest run — including failures — so results can never be silently
cherry-picked or a losing run quietly forgotten.

## Experiment registry

`services/persistence` migration `002_backtest_runs` adds a `backtest_runs`
table storing, for every run: instrument, strategy, IS/OOS bar/trade counts,
IS/OOS return and Sharpe, `oosHoldsUp`, the `promotedLabel` decided at that
time, and the full `WalkForwardReport` as JSON for audit/reproducibility.
`SqliteBacktestRunRepository` (in `@fintel/persistence`) is the only writer;
`runExperiment()` (in `@fintel/quant-research`) is the only code path that
calls it — every backtest run, win or lose, is recorded.

## Promotion criteria (deliberately conservative, documented so they can't be quietly loosened)

### `HYPOTHESIS` -> `EXPERIMENTAL`

A single walk-forward run clears this bar only if **all** of the following hold
(`evaluateSingleRun()` in `services/quant-research/src/promotion.ts`):

1. OOS trade count >= `MIN_OOS_TRADES_FOR_EXPERIMENTAL` (**30** — a conservative
   rule-of-thumb minimum for any trade-level statistic to mean anything at all)
2. OOS total return > 0
3. OOS Sharpe ratio > 0
4. IS total return > 0 (directional consistency — if OOS looks good but IS
   doesn't, that's more consistent with noise than a genuine effect)

Failing **any** of these keeps the strategy at `HYPOTHESIS`, with the specific
failing reasons recorded and surfaced (never a bare "no").

### `EXPERIMENTAL` -> `ESTABLISHED`

A single good backtest run is never enough. Promotion to `ESTABLISHED`
additionally requires, across the FULL run history in the registry:

- At least `MIN_CLEARING_RUNS_FOR_ESTABLISHED` (**3**) independent runs that
  each individually cleared the `EXPERIMENTAL` bar
- Those clearing runs must span **at least 2 distinct instruments** (a
  strategy that only ever "works" on one specific symbol is much more likely
  overfit to that symbol's idiosyncrasies than genuinely edge-bearing)

This bar is intentionally hard to clear with the strategies shipped in this
milestone — see the honest results below, none of which get anywhere close.

## Honest results (see also `016_BACKTEST_ENGINE.md` for the full table)

Running `runExperiment()` for all 3 strategies against BTC and ETH:

- **0 of 6** runs cleared the `EXPERIMENTAL` bar.
- **0 of 6** were promoted to anything other than `HYPOTHESIS`.
- The registry now contains 6 recorded runs (all `HYPOTHESIS`), forming the
  starting history for any future promotion decision — future runs on the
  same strategy will see this history and cannot get an easier ride just
  because earlier attempts are forgotten.

This is not a disappointing bug — it is the system doing exactly what it is
supposed to do: refusing to call three simple technical-analysis heuristics
"validated" without real evidence that they hold up out-of-sample with enough
trades to matter.

## What would change this

- More historical data (more OOS trades) could let `ema-crossover-rsi-filter`
  or `bollinger-mean-reversion` actually clear the trade-count bar — worth
  re-running once a longer bar history is available.
- A genuinely different, better-designed strategy (this milestone's 3
  strategies are simple, well-known TA heuristics, explicitly chosen as a
  DEMONSTRATION of the pipeline, not as a claim of edge).
- Multi-instrument, multi-period validation, which is exactly what the
  `ESTABLISHED` bar requires and none of the current strategies have.

## Follow-on work (not built in this milestone)

- Rolling (multi-fold) walk-forward instead of a single 70/30 split
- A proper feature/dataset store for reproducible research artifacts
  (fixed seeds, pinned data snapshots)
- Promotion decisions surfaced in the CLI/API signal output itself (currently
  a signal's `honestyLabel` is set by the Signal Engine at generation time,
  independent of the backtest registry — wiring these together, so a
  `signals` call reflects the LATEST promotion decision for that
  strategy/instrument pair, is a natural next step)

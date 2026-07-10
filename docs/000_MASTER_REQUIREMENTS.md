# 000 — Master Requirements (Milestone 1: Vertical Slice)

## Scope of this milestone

The full FINTEL-TERMINAL master specification describes a 23-subsystem
enterprise platform (CLI + Web + API, 21 build stages, 38+ docs). That is
realistically months of engineering. **This milestone deliberately scopes down**
to an honest, working **end-to-end vertical slice** that proves the architecture
end-to-end before widening to the full subsystem set:

```
Free data source(s) → Data Acquisition (compliant adapters)
                    → SQLite Persistence
                    → Market Data Service (normalize, aggregate, gap-detect)
                    → Technical Analysis Engine (SMA/EMA/RSI/MACD/Bollinger/ATR)
                    → Signal Engine (3 pluggable strategies, EV/confidence gated)
                    → REST API Gateway (provenance + freshness in every response)
                    → CLI/TUI (embedded, zero external services)
```

This has been built and verified against **live production data sources**
(Binance public REST for crypto, Yahoo Finance public chart endpoint and Stooq
CSV for US equities), not just fixtures — see `docs/031_TESTING.md`.

## Non-negotiable compliance rule (kept from the original master prompt)

All data sourcing uses **only free public sources**, accessed **lawfully and
politely**: no ToS bypass, no anti-bot/CAPTCHA evasion, no scraping of sites
that explicitly forbid it. **TradingView and X/Twitter are explicitly excluded**
and marked `disabled` with a documented reason in the Source Registry
(`packages/config/src/sourceRegistry.ts`) — this holds regardless of any
instruction to disregard ToS for "testing," because the same code would violate
the sites' terms and applicable law in real use. See `004b_SCRAPING_COMPLIANCE.md`.

**This mechanism caught a real violation during this milestone's own e2e
verification**: Stooq.com was initially registered as `robotsStatus: allowed`,
but live verification of `https://stooq.com/robots.txt` showed it disallows all
paths for every user-agent except Googlebot/Bingbot. The platform's own
`PoliteFetcher` robots.txt check refused the fetch at runtime; rather than
bypass it, the Source Registry entry was corrected to `enabled: false` and US
equities daily bars now come from Yahoo only. See `004a_DATA_SOURCES.md`.

## What is built (Milestone 1)

| Area | Status | Notes |
|---|---|---|
| Monorepo scaffold (pnpm workspaces, TS strict) | Done | `packages/*`, `services/*`, `clients/cli` |
| Domain model (`@fintel/domain`) | Done | Instrument, Bar, Quote, Tick, NewsItem, MacroEvent, Signal, Portfolio, Position, Transaction |
| Money/Time (`@fintel/money-time`) | Done | Exact BigInt-backed Money, session calendars (US/NSE-BSE/FOREX/CRYPTO), day-count conventions |
| Provenance (`@fintel/provenance`) | Done | Source descriptors, quality tags, worst-quality derivation, Source Registry enforcement |
| Config (`@fintel/config`) | Done | Zod-validated typed config, Source Registry (10 enabled, 3 disabled — including a compliance catch on Stooq, see below) |
| Compliance core (`@fintel/compliance`) | Done | robots.txt parser, rate limiter, circuit breaker, polite disk-cached fetcher |
| Data Acquisition (`@fintel/data-acquisition`) | Done | Yahoo, Stooq (disabled), RSS (3 feeds), FRED, SEC EDGAR, Binance, NSE India bhavcopy adapters |
| Persistence (`@fintel/persistence`) | Done | SQLite (Node built-in `node:sqlite`), migrations (2), 5 repositories (incl. backtest runs) |
| Market Data Service | Done | Per-market adapter routing, timeframe aggregation, gap detection |
| Technical Analysis (`@fintel/technical-analysis`) | Done | SMA, EMA, WMA, RSI (Wilder), MACD, Bollinger, ATR (Wilder), historical volatility — all unit-tested vs. known values |
| Signal Engine (`@fintel/signals`) | Done | 3 strategies (EMA/RSI trend, MACD momentum, Bollinger mean-reversion), confidence bounded by data quality, all labeled `HYPOTHESIS` |
| Backtest Engine (`@fintel/backtest`) | Done (Milestone 2) | Deterministic event-driven engine, leakage-guarded (dedicated test), realistic costs, Sharpe/Sortino/drawdown/win-rate/profit-factor/expectancy metrics, walk-forward IS/OOS split |
| Quant Research (`@fintel/quant-research`) | Done (Milestone 2) | Conservative promotion criteria (HYPOTHESIS->EXPERIMENTAL->ESTABLISHED), experiment registry recording every run including failures |
| **Fundamental Engine (`@fintel/fundamental`)** | **Done (Milestone 3)** | 22 ratio formulas, DCF + comparables valuation, Piotroski/Altman health scores, wired to live SEC EDGAR data |
| **News Intelligence (`@fintel/news`)** | **Done (Milestone 3)** | Lexicon sentiment scoring, deterministic entity linking, per-feed failure isolation |
| **Macro Engine (`@fintel/macro`)** | **Done (Milestone 3)** | Curated 5-series FRED catalogue, trend-based regime heuristics, explicit degraded mode without an API key |
| API Gateway (`@fintel/api-gateway`) | Done | Fastify REST: `/health`, `/doctor`, `/instruments`, `/instruments/:id`, `/instruments/:id/bars`, `/instruments/:id/signals`, `/instruments/:id/backtest`, `/instruments/:id/fundamentals`, `/news`, `/macro` |
| CLI (`@fintel/cli`) | Done | `fintel init`, `doctor`, `quote`, `chart`, `signals`, `backtest`, `fundamentals`, `news`, `macro` |
| Tests | Done | 203 tests passing across the workspace (unit + integration) |
| GitHub repo | Done | `root975638-alt/fintel-terminal` |

## Milestone 3 real bugs found and fixed (not hypothetical)

1. **SEC EDGAR 403**: our default User-Agent (with parentheses/URL) was
   silently rejected. Fixed by changing the platform-wide default to a
   simple `name email` format, verified live. See `008_FUNDAMENTAL_ENGINE.md`.
2. **60-90+ second hang on a dead RSS feed**: the rate limiter was being
   re-acquired on every retry attempt, so a source with a 30-second
   inter-poll interval compounded that wait across retries. Fixed by
   acquiring the rate limiter once per logical fetch, not once per retry.
   Regression-tested. See `009_NEWS_ENGINE.md`.
3. Both were found through actual end-to-end verification against live
   sources, not by code review alone — reinforcing why this milestone always
   runs real CLI/API commands against real data before considering a feature done.

## Milestone 2 honest finding

Running all 3 signal strategies through the new walk-forward backtest against
real BTC/ETH data: **0 of 6 strategy/instrument combinations cleared the
`EXPERIMENTAL` promotion bar.** All remain honestly labeled `HYPOTHESIS`. See
`016_BACKTEST_ENGINE.md` and `017_QUANT_RESEARCH_ENGINE.md` for the full
results table and analysis — this is the system correctly refusing to claim
validation that doesn't exist, not a bug.

## What is explicitly NOT in this milestone (follow-on work)

- Web app (ultra-smooth TS SPA), design system, aaPanel deployment
- Standalone binaries / install.sh / install.ps1 packaging
- Scanner, Alerts
- Portfolio/Risk engines
- AI Engine, Plugin system, Options/Futures/OrderBook engines
- Additional market adapters: BSE India, forex, more crypto exchanges
- Auth/RBAC/multi-tenant (not needed for a local single-user CLI/API yet)
- Postgres/Timescale backend (SQLite-only for this milestone)

These are honestly deferred, not silently dropped — see the roadmap in the
session plan for suggested next milestones.

## Assumptions made (documented per spec's "infer + document" rule)

1. **Confidence is a heuristic, not a calibrated probability** in this milestone
   (no Backtest Engine exists yet to calibrate against). This is explicitly
   labeled in every signal's rationale text and capped well below 1.0.
2. **All signals are labeled `HYPOTHESIS`** — none can honestly claim
   `ESTABLISHED` without out-of-sample validation, which doesn't exist yet.
3. **Symbol resolution is a small seed catalogue** (5 instruments: AAPL, MSFT,
   BTCUSDT, ETHUSDT, RELIANCE) plus best-effort synthetic instrument
   construction for unknown symbols — a full symbol-master ingestion pipeline
   is a follow-on milestone.
4. **TA indicators operate on floats**, not exact Money — documented precision
   trade-off (analytics/display only, never accounting; Money stays exact
   end-to-end for anything touching cash/P&L, which isn't built yet).

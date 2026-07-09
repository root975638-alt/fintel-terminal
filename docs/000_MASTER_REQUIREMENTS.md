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

## What is built (Milestone 1)

| Area | Status | Notes |
|---|---|---|
| Monorepo scaffold (pnpm workspaces, TS strict) | Done | `packages/*`, `services/*`, `clients/cli` |
| Domain model (`@fintel/domain`) | Done | Instrument, Bar, Quote, Tick, NewsItem, MacroEvent, Signal, Portfolio, Position, Transaction |
| Money/Time (`@fintel/money-time`) | Done | Exact BigInt-backed Money, session calendars (US/NSE-BSE/FOREX/CRYPTO), day-count conventions |
| Provenance (`@fintel/provenance`) | Done | Source descriptors, quality tags, worst-quality derivation, Source Registry enforcement |
| Config (`@fintel/config`) | Done | Zod-validated typed config, Source Registry (11 enabled, 2 disabled) |
| Compliance core (`@fintel/compliance`) | Done | robots.txt parser, rate limiter, circuit breaker, polite disk-cached fetcher |
| Data Acquisition (`@fintel/data-acquisition`) | Done | Yahoo, Stooq, RSS (3 feeds), FRED, SEC EDGAR, Binance, NSE India bhavcopy adapters |
| Persistence (`@fintel/persistence`) | Done | SQLite (Node built-in `node:sqlite`), migrations, 4 repositories |
| Market Data Service | Done | Per-market adapter routing, timeframe aggregation, gap detection |
| Technical Analysis (`@fintel/technical-analysis`) | Done | SMA, EMA, WMA, RSI (Wilder), MACD, Bollinger, ATR (Wilder), historical volatility — all unit-tested vs. known values |
| Signal Engine (`@fintel/signals`) | Done | 3 strategies (EMA/RSI trend, MACD momentum, Bollinger mean-reversion), confidence bounded by data quality, all labeled `HYPOTHESIS` |
| API Gateway (`@fintel/api-gateway`) | Done | Fastify REST: `/health`, `/doctor`, `/instruments`, `/instruments/:id`, `/instruments/:id/bars`, `/instruments/:id/signals` |
| CLI (`@fintel/cli`) | Done | `fintel init`, `doctor`, `quote`, `chart` (ASCII sparkline), `signals` |
| Tests | Done | 106 tests passing across the workspace (unit + integration) |
| GitHub repo | Next | `root975638-alt/fintel-terminal` |

## What is explicitly NOT in this milestone (follow-on work)

- Web app (ultra-smooth TS SPA), design system, aaPanel deployment
- Standalone binaries / install.sh / install.ps1 packaging
- Fundamental engine (SEC EDGAR ratios/DCF), News Intelligence (sentiment/entity
  linking), Macro Engine (regime tagging), Scanner, Alerts
- Portfolio/Risk engines, Backtest Engine, Quant Research platform
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

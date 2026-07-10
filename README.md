# FINTEL-TERMINAL

> **For informational/research/educational purposes only. Not financial
> advice.** Data is sourced from free public sources and may be delayed,
> incomplete, or inaccurate. Markets involve risk of loss. See
> [DISCLAIMER.md](./DISCLAIMER.md).

A free-data financial intelligence platform: CLI/TUI terminal + REST API,
sourcing market data, news, and macro data **exclusively from free public
sources** (public APIs, RSS/Atom feeds, official open datasets) — no paid or
commercial data subscriptions.

## Status: Milestone 1 — Vertical Slice (complete)

This is the first milestone of a much larger planned platform (see
[`docs/000_MASTER_REQUIREMENTS.md`](./docs/000_MASTER_REQUIREMENTS.md) for full
scope and honest roadmap). It proves the full architecture end-to-end:

```
Free data source -> Data Acquisition -> SQLite -> Market Data -> Technical Analysis
                 -> Signal Engine -> REST API -> CLI
```

verified against **live** data from Binance (crypto), Yahoo Finance and Stooq
(US equities).

## Quick start

Requires **Node.js >= 22.5** (uses the built-in `node:sqlite` module — zero
native compilation, works on Termux/ARM).

```bash
pnpm install
pnpm -r build

# Initialize local config + SQLite database
node clients/cli/dist/main.js init

# Check your environment
node clients/cli/dist/main.js doctor

# Get a live quote
node clients/cli/dist/main.js quote CRYPTO:BTCUSDT

# ASCII sparkline chart
node clients/cli/dist/main.js chart CRYPTO:ETHUSDT --bars 60

# Advisory signals (3 strategies: EMA/RSI trend, MACD momentum, Bollinger mean-reversion)
node clients/cli/dist/main.js signals CRYPTO:BTCUSDT

# Walk-forward backtest (in-sample/out-of-sample, with honest promotion decision)
node clients/cli/dist/main.js backtest CRYPTO:BTCUSDT --strategy ema-crossover-rsi-filter

# Fundamental ratios from live SEC EDGAR data (US equities only)
node clients/cli/dist/main.js fundamentals AAPL

# Recent financial news with sentiment scoring and entity linking
node clients/cli/dist/main.js news

# US macro regime snapshot (requires a free FRED_API_KEY)
node clients/cli/dist/main.js macro
```

Or run the REST API:

```bash
node services/api-gateway/dist/server.js
curl http://127.0.0.1:4310/instruments/CRYPTO:BTCUSDT/bars?timeframe=1d
```

## Data sources (see `docs/004a_DATA_SOURCES.md` for the full registry)

Only genuinely free, compliant sources are used — no ToS bypass, no scraping
of sites that forbid it (TradingView and X/Twitter are explicitly excluded;
see `docs/004b_SCRAPING_COMPLIANCE.md`):

- **Yahoo Finance** public chart JSON endpoint (US equities quotes/bars)
- **Stooq.com** free CSV export (US equities daily bars)
- **Binance** public REST API (crypto quotes/bars)
- **NSE India** official daily bhavcopy files
- **RSS/Atom** feeds: Reuters, MarketWatch, Yahoo Finance headlines
- **FRED** (Federal Reserve economic data — free registration key)
- **SEC EDGAR** (official company filings API)

## Architecture

See [`docs/002_SYSTEM_ARCHITECTURE.md`](./docs/002_SYSTEM_ARCHITECTURE.md).
TypeScript strict, pnpm workspaces, Hexagonal/Ports & Adapters, SQLite
persistence (Node built-in, zero native deps), Fastify API, Commander CLI.

## Testing

203 tests passing across the workspace. See
[`docs/031_TESTING.md`](./docs/031_TESTING.md).

```bash
pnpm -r test
```

## Repository layout

```
packages/
  domain/           Core entities: Instrument, Bar, Quote, Signal, etc.
  money-time/        Exact Money arithmetic + session calendars + timeframes
  provenance/         Source/quality/freshness tracking, Source Registry enforcement
  config/              Typed config (Zod) + the Source Registry
  compliance/           robots.txt, rate limiter, circuit breaker, polite fetcher
  types/                 Shared API/CLI DTOs
  core/                   Embeddable composition root (used by CLI + API)
services/
  data-acquisition/  Yahoo/Stooq(disabled)/RSS/FRED/SEC/Binance/NSE adapters
  persistence/        SQLite repositories + migrations (instruments, bars, news, signals, backtest runs, macro observations)
  market-data/         Aggregation, gap detection, per-market routing
  technical-analysis/   SMA/EMA/RSI/MACD/Bollinger/ATR
  signals/                Pluggable strategy framework + 3 strategies
  backtest/                 Deterministic, leakage-guarded walk-forward backtest engine
  quant-research/            Promotion criteria (HYPOTHESIS->EXPERIMENTAL->ESTABLISHED) + experiment registry
  fundamental/                22 ratio formulas, DCF/comparables valuation, Piotroski/Altman health scores
  news/                        RSS sentiment + entity linking, per-feed failure isolation
  macro/                        FRED series catalogue + trend-based regime tagging
  api-gateway/                    Fastify REST API (incl. /backtest, /fundamentals, /news, /macro)
clients/
  cli/                Commander-based CLI/TUI (quote, chart, signals, backtest, fundamentals, news, macro, doctor, init)
docs/                 Architecture, compliance, testing docs (000-038 numbering)
```

## Roadmap (follow-on milestones, not yet built)

- Scanner + Alerts
- Portfolio + Risk engines
- Web app (ultra-smooth TypeScript SPA) + design system
- Packaging (standalone binaries, install scripts) + aaPanel deployment
- AI Engine (local/open models, advisory-only)
- Additional markets: BSE India, forex, more crypto exchanges

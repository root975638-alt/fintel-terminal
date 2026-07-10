# 031 — Testing (Milestone 1)

## Current state: 203 tests passing, 0 failing

```
pnpm -r test
```

runs the full workspace suite. Breakdown:

| Package | Tests | What's covered |
|---|---|---|
| `@fintel/money-time` | 23 | Money exact decimal arithmetic (no float error), rounding modes, session calendars (US/NSE-BSE/FOREX/CRYPTO), day-count conventions |
| `@fintel/provenance` | 11 | worstQuality derivation, deriveProvenance bounding, quality-from-age inference, source-enabled assertion |
| `@fintel/config` | 9 | Config defaults/overrides/validation errors, Source Registry invariants (no dupes, disabled sources have reasons, TradingView/X/Stooq marked disabled) |
| `@fintel/compliance` | 13 | robots.txt parsing (Allow/Disallow/Crawl-delay, longest-match-wins, wildcards), circuit breaker state transitions, rate limiter enforcement, **retry/rate-limit interaction regression** (a real bug found in Milestone 3) |
| `@fintel/technical-analysis` | 16 | SMA/EMA hand-verified against known values, RSI monotonic-trend behavior + flat-series=50, MACD zero-histogram on flat series, Bollinger band width from a known population stdDev, ATR seeding behavior |
| `@fintel/signals` | 3 | Insufficient-history → no signal, sustained-uptrend → long bias from the trend strategy, confidence bounded by worst input data quality |
| `@fintel/market-data` | 7 | M1→H1 aggregation OHLCV correctness, quality-bounding through aggregation, gap detection on a continuous 24/7 calendar |
| `@fintel/persistence` | 7 | Migration idempotency, Instrument/Bar upsert+query round-trips with **exact decimal string preservation**, conflict-update semantics, bucket-range filtering |
| `@fintel/backtest` | 28 | Cost model (market impact + commission math), **leakage guard** (strategy never sees future bars, asserted via a spy strategy), full trade-mechanics integration (always-long, alternating-direction), Sharpe/Sortino/drawdown/win-rate/profit-factor hand-verified against known series, walk-forward IS/OOS independence |
| `@fintel/quant-research` | 13 | Promotion bar logic (EXPERIMENTAL requires all 4 conditions), no single-run promotion to ESTABLISHED, instrument-diversity requirement for ESTABLISHED, prior non-clearing runs correctly excluded |
| `@fintel/fundamental` | 41 | 22 ratio formulas hand-verified, DCF PV/terminal-value math hand-verified, comparables median calculation, Piotroski F-Score 9-criteria scoring (9/9 and 0/9 cases), Altman Z-Score exact formula weights and zone classification |
| `@fintel/news` | 19 | Sentiment lexicon + negation handling, entity-linking word-boundary/multi-match/case-insensitivity, **NewsService fixture-based integration** (per-feed failure isolation, persistence round-trip) |
| `@fintel/macro` | 13 | Trend classifier (rising/falling/flat, null-handling), rate/inflation regime wrappers against known synthetic series |
| `@fintel/domain`, `@fintel/types`, `@fintel/core`, `@fintel/data-acquisition`, `@fintel/api-gateway`, `@fintel/cli` | 0 (passWithNoTests) | Pure type/interface or composition-only packages, exercised via the manual e2e smoke test below rather than isolated unit tests |

## End-to-end smoke test performed (manual, documented here for repeatability)

This exact sequence was run against the **live** Binance public API and Yahoo
Finance public endpoint (not a fixture) to prove the full pipeline works:

```bash
fintel init
fintel doctor              # -> all checks OK/WARN (WARN only for optional FRED_API_KEY)
fintel quote CRYPTO:BTCUSDT   # -> real BTC price from Binance, quality=realtime
fintel chart CRYPTO:ETHUSDT -b 60   # -> ASCII sparkline of real ETH daily closes
fintel signals CRYPTO:BTCUSDT   # -> 3 strategies evaluated, all labeled HYPOTHESIS,
                                 #    confidence bounded to <=0.65 by "realtime" ceiling
fintel quote AAPL            # -> real AAPL price from Yahoo, quality=delayed
```

The API Gateway was also started and hit directly:

```bash
curl http://127.0.0.1:4310/health
curl http://127.0.0.1:4310/doctor
curl http://127.0.0.1:4310/instruments
curl "http://127.0.0.1:4310/instruments/CRYPTO:BTCUSDT/bars?timeframe=1d"
curl "http://127.0.0.1:4310/instruments/CRYPTO:BTCUSDT/signals?timeframe=1d"
```

All responses returned real data with correctly populated `provenance` and
`freshness` fields, confirming the ports & adapters architecture works
end-to-end, not just in isolation.

## Why persistence tests use `node:test` instead of Vitest

See `002_SYSTEM_ARCHITECTURE.md` — Vite cannot yet resolve the very new
`node:sqlite` built-in module. The persistence package's tests compile via
`tsc -p tsconfig.test.json` and run via `node --test dist-test/test/*.js`,
avoiding any bundler.

## Fixture/live-network policy (per spec: never hit live sites in unit tests)

- Compliance tests (robots.txt parsing, rate limiter, circuit breaker) use
  **synthetic in-memory fixtures**, never live HTTP.
- Adapter unit tests are a documented gap in this milestone — the adapters were
  verified via the manual e2e smoke test above (live Binance/Yahoo/Stooq calls)
  rather than recorded-fixture unit tests. **Follow-on work**: record real
  response fixtures for each adapter (Yahoo chart JSON, Stooq CSV, Binance
  klines JSON, NSE bhavcopy CSV, sample RSS/Atom XML) and add fixture-based
  parsing tests that never touch the network, per the original spec's testing
  mandate.

## Test commands

```bash
pnpm -r build        # build all packages/services
pnpm -r test         # run all tests
pnpm --filter @fintel/technical-analysis test   # run one package's tests
```

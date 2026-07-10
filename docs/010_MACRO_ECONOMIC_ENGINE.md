# 010 — Macro Economic Engine

## Purpose

Fetch US macro indicators from FRED (the official, free Federal Reserve
economic data API) and apply simple, honestly-labeled trend heuristics — not
a claim of genuine "regime detection", which requires far more synthesis
than a single-series trend check.

## Architecture

```
services/macro/src/
  seriesCatalogue.ts   Curated list of 5 FRED series, each with a documented limitation
  regime.ts             Trend classifier + rate/inflation regime heuristics
  macroService.ts         Wires FredAdapter -> persistence -> regime computation
```

## Series catalogue (5 curated indicators, not comprehensive)

FRED publishes hundreds of thousands of series; this milestone deliberately
picks 5 headline US indicators, each documented with what it measures and a
known limitation (e.g. GDP is nominal not inflation-adjusted; UNRATE is the
U-3 measure and doesn't capture underemployment; DGS10 has expected gaps on
weekends/holidays, not missing data):

| Series | Measures | Cadence |
|---|---|---|
| GDP | US Gross Domestic Product (nominal) | Quarterly |
| CPIAUCSL | US Consumer Price Index (headline, incl. food/energy) | Monthly |
| UNRATE | US Unemployment Rate (U-3) | Monthly |
| FEDFUNDS | US Federal Funds Effective Rate | Monthly |
| DGS10 | US 10-Year Treasury Constant Maturity Rate | Daily |

## Regime tagging (`EXPERIMENTAL`, explicitly NOT an economic model)

`classifyTrend()` compares the first and last non-null values in a trailing
window (default 6 observations) and classifies the direction as
rising/falling/flat, with a configurable "flat" threshold band to avoid
reading noise as a trend. `classifyRateRegime()` and
`classifyInflationRegime()` are thin, honestly-named wrappers over this one
mechanical trend check — not a synthesis of multiple indicators the way real
regime identification (e.g. NBER recession dating committees) actually works.
13 unit tests verify the trend classifier against known synthetic series
(rising, falling, flat, with nulls interspersed).

## Explicit degraded mode (never fabricated data)

FRED requires a free self-service API key (not a paid API — just
registration to prevent abuse). When `FRED_API_KEY` is not configured,
`fintel macro` and `GET /macro` both return a clear, actionable message
("Register a free key at https://fred.stlouisfed.org/docs/api/api_key.html")
rather than silently returning empty/fabricated data or crashing with a raw
stack trace. Verified live:

```
$ fintel macro
FRED_API_KEY is not configured - macro data is unavailable (explicit degraded
mode, not fabricated). Register a free key at
https://fred.stlouisfed.org/docs/api/api_key.html and set FRED_API_KEY in your .env.
```

```
GET /macro -> HTTP 503, {"error":{"code":"FRED_API_KEY_MISSING", ...}}
```

This milestone did not obtain a FRED API key, so the actual FEDFUNDS/CPIAUCSL
regime computation has not been exercised against live data — the fetch path
through `FredAdapter` was already built and unit-testable in Milestone 1, and
the regime-tagging logic on top of it is independently unit-tested here with
synthetic data; only the live end-to-end pull with a real key remains
unverified, honestly disclosed rather than glossed over.

## Follow-on work (not built in this milestone)

- Obtain a real FRED_API_KEY and verify the live end-to-end pull
- Expand the series catalogue (yield curve spread, PCE, ISM PMI, etc.)
- A genuine multi-indicator regime synthesis (would require much more
  economic modeling than a single-series trend check, and should be labeled
  accordingly — likely still `EXPERIMENTAL` at best without real backtested
  validation against historical regime turning points)

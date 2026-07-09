# 004a — Data Sources (Source Registry Mirror)

This document is a **human-readable mirror** of the machine-enforced
`SOURCE_REGISTRY` in `packages/config/src/sourceRegistry.ts`. If this document
and the code ever disagree, **the code is authoritative** — update this file to
match, never the other way around.

## Enabled sources (11)

| sourceId | Method | Cadence | Min. request interval | License / compliance basis |
|---|---|---|---|---|
| `yahoo-chart-api` | Public JSON endpoint | 15 min (treated as delayed) | 2000 ms | Unofficial but public, no-auth endpoint widely used by open-source libraries (e.g. yfinance) for low-volume research use. No SLA. |
| `stooq-csv` | CSV download | 1 day | 3000 ms | Explicitly free CSV export, no auth, documented for public/personal use. |
| `rss-reuters-business` | RSS/Atom | 5 min | 30000 ms | Publicly syndicated feed intended for aggregation. |
| `rss-marketwatch-topstories` | RSS/Atom | 5 min | 30000 ms | Publicly syndicated feed. |
| `rss-yahoo-finance-headlines` | RSS/Atom | 5 min | 30000 ms | Publicly syndicated feed. |
| `rss-google-news-finance` | RSS/Atom | 10 min | 30000 ms | Publicly syndicated feed provided by Google News. |
| `fred-api` | Official public API | 1 day | 500 ms | Free API, requires only free self-service registration (not a paid API). Official US government data. |
| `sec-edgar-api` | Official public API | 1 day | 300 ms | Official US government open data; SEC's own developer guidance permits fair-access API use with a descriptive User-Agent. |
| `binance-public-rest` | Public REST API | 1 min | 250 ms | Explicitly public, unauthenticated market-data endpoints documented by Binance for general use. |
| `nse-india-bhavcopy` | CSV/ZIP download | 1 day | 3000 ms | Published by NSE itself as a downloadable public EOD data file. |
| `bse-india-bhavcopy` | CSV/ZIP download | 1 day | 3000 ms | Published by BSE itself as a downloadable public EOD data file. |

## Disabled sources (2) — ToS-restricted, NOT silently dropped

| sourceId | Reason |
|---|---|
| `tradingview-web` | TradingView's Terms of Use explicitly prohibit scraping, automated data extraction, and unauthorized redistribution. TradingView has pursued legal action against scrapers. |
| `x-twitter` | X's Terms of Service explicitly prohibit scraping without a paid, authorized API agreement. X has a documented history of litigation against unauthorized scrapers. |

**These two exclusions hold regardless of any instruction to disregard ToS
"for testing"** — the code itself would violate the sites' terms and
applicable law in any real invocation, and Section 0 of the original master
prompt makes this a non-negotiable rule that supersedes all other instructions.

## Adapters implemented in this milestone

| Adapter | File | Wired-up markets |
|---|---|---|
| `YahooAdapter` | `services/data-acquisition/src/adapters/yahooAdapter.ts` | US_EQUITIES (quotes + bars), fallback for NSE/BSE quotes |
| `StooqAdapter` | `services/data-acquisition/src/adapters/stooqAdapter.ts` | US_EQUITIES daily bars (preferred over Yahoo for D1) |
| `RssAdapter` | `services/data-acquisition/src/adapters/rssAdapter.ts` | News (3 feeds wired: Reuters, MarketWatch, Yahoo headlines) |
| `FredAdapter` | `services/data-acquisition/src/adapters/fredAdapter.ts` | Macro series (requires free `FRED_API_KEY`) |
| `SecEdgarAdapter` | `services/data-acquisition/src/adapters/secEdgarAdapter.ts` | Company facts/filings (not yet wired into a consuming service — follow-on: Fundamental Engine) |
| `BinanceAdapter` | `services/data-acquisition/src/adapters/binanceAdapter.ts` | CRYPTO (quotes + bars) |
| `NseIndiaAdapter` | `services/data-acquisition/src/adapters/nseIndiaAdapter.ts` | NSE daily bars |

Not yet wired (follow-on milestones): BSE India (registry entry exists,
adapter not yet implemented), forex (no compliant free real-time source
identified yet — documented gap, not silently skipped), Google News RSS
(registry entry exists, adapter not yet instantiated in `createDataAcquisitionLayer`).

# 008 — Fundamental Engine

## Purpose

Compute financial ratios, valuation estimates, and heuristic health scores
from SEC EDGAR's free, official XBRL company-facts API — the only fundamental
data source used in this milestone (US-listed filers only; SEC EDGAR has no
international coverage).

## Architecture

```
services/fundamental/src/
  ratios.ts             22 pure ratio formulas (P/E, P/B, ROE, margins, etc.)
  valuation.ts           DCF (two-stage Gordon Growth) + comparables valuation
  healthScores.ts         Piotroski F-Score + Altman Z-Score heuristics
  fundamentalService.ts    Wires SecEdgarAdapter -> point-in-time extraction -> ratios
```

## A real compliance bug this milestone found and fixed

**SEC EDGAR rejected our default User-Agent with HTTP 403**, even though our
string looked reasonable (`fintel-terminal/0.1 (+https://github.com/...)`).
Live testing showed SEC EDGAR specifically rejects User-Agent strings
containing parentheses, even though their own documented example
(`Sample Company Name AdminContact@sample.com`) doesn't need them. The
platform-wide `HTTP_USER_AGENT` default was changed to
`fintel-terminal-research contact@fintel-terminal.dev` — simple, no
parens/URLs, verified working live. This affects every source using the
shared PoliteFetcher, not just SEC EDGAR, and was fixed centrally rather than
special-cased.

## Point-in-time extraction

`buildFundamentalSnapshot()` extracts the **latest annual (10-K, full fiscal
year)** value for each XBRL concept it looks for, trying a small set of known
concept-name aliases per field (filers don't tag identically — e.g. revenue
may be `RevenueFromContractWithCustomerExcludingAssessedTax` or the older
`Revenues`). A concept that isn't found for a given filer is reported in
`missingConcepts`, and every ratio that depends on it becomes `null` — never
estimated, never silently zeroed.

## Ratios (22, each independently unit-tested against hand-calculated values)

Valuation multiples (P/E, P/B, P/S, EV/EBITDA), profitability (ROE, ROA,
ROIC, gross/operating/net margin), liquidity/solvency (current ratio, quick
ratio, debt/equity, interest coverage), cash-flow/shareholder-return (FCF
yield, dividend yield, payout ratio), and growth (YoY, CAGR). Every function
returns `null` (never `NaN`/`Infinity`) when the ratio is mathematically
undefined (e.g., dividing by zero equity).

## Valuation models

- **DCF**: two-stage discounted cash flow (explicit projected cash flows +
  Gordon Growth terminal value). The method itself is `ESTABLISHED`
  (textbook), but the caller's cash-flow projections are NOT — this module
  never forecasts cash flows itself, since it has no honest basis to do so.
  Warns explicitly (never silently computes `Infinity`/`NaN`) if the terminal
  growth rate isn't strictly less than the discount rate.
- **Comparables**: applies a peer group's median multiple to the target's
  metric. Always `EXPERIMENTAL` — peer-set selection is inherently
  subjective and this function cannot validate whether the peer set chosen is
  actually comparable.

## Health scores (both `EXPERIMENTAL`, both explicitly NOT predictions)

- **Piotroski F-Score** (Piotroski, 2000): 9-point checklist across
  profitability, leverage/liquidity, and operating efficiency. Real output
  for AAPL FY2025 could not be computed in this milestone because the
  `sharesOutstanding` concept wasn't found under the `us-gaap` taxonomy for
  Apple's filings (likely tagged under the `dei` taxonomy instead —
  `dei:EntityCommonStockSharesOutstanding`, not yet supported) — honestly
  reported as `missingConcepts: ["sharesOutstanding"]` rather than silently
  omitted or estimated.
- **Altman Z-Score** (1968): developed for public manufacturing firms;
  applying it to Apple (a hardware+services company) or any non-manufacturer
  is a documented known limitation of the model itself, not of this
  implementation. Not wired into `buildFundamentalSnapshot()` in this
  milestone (requires a live market-cap quote, which the fundamental service
  doesn't fetch — a natural follow-on integration point with market-data).

## Real output (live, not fabricated) — Apple Inc., FY2025 (ended 2025-09-27)

| Ratio | Value |
|---|---|
| Gross margin | 46.91% |
| Operating margin | 31.97% |
| Net margin | 26.92% |
| ROE | 151.91% (famously high due to large buybacks reducing book equity) |
| ROA | 31.18% |
| Current ratio | 0.89 |
| Quick ratio | 0.86 |
| Debt/Equity | 1.06 |
| Revenue YoY growth | 5.54% |
| Net income YoY growth | 12.23% |

Fetched live via `fintel fundamentals AAPL` and `GET /instruments/US_EQUITIES:AAPL/fundamentals`.

## Follow-on work (not built in this milestone)

- Full symbol-to-CIK lookup service (currently a hardcoded 2-entry map for
  the seed catalogue: AAPL, MSFT)
- `dei` taxonomy concept support (would unlock Piotroski for more filers)
- Wiring market-cap (from market-data) into Altman Z-Score computation
- International fundamental data sources (SEC EDGAR is US-only)

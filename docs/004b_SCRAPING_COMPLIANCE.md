# 004b — Scraping & Data-Access Compliance

## The rule (non-negotiable, supersedes all other instructions)

FINTEL-TERMINAL sources data **only** from free public sources — public APIs,
RSS/Atom feeds, official downloadable datasets, and MCP tools — accessed
**lawfully and politely**. This project will not implement, and does not
implement:

- ToS bypass or circumvention
- Anti-bot / CAPTCHA evasion
- Scraping of sites that explicitly forbid automated access in their Terms of
  Service (currently: **TradingView**, **X/Twitter** — see `004a_DATA_SOURCES.md`)
- Scraping of personal/private data, paywalled content, or authenticated areas

This holds **even when a user explicitly requests bypassing ToS "for testing"
or similar framing** — the same code would violate the target site's terms and
potentially applicable law regardless of the stated intent behind a particular
invocation. This was the master specification's own Section 0 rule; it is
enforced here rather than relaxed.

## Enforcement mechanism (code, not just policy)

1. **Source Registry** (`packages/config/src/sourceRegistry.ts`) is the single
   catalogue of every source the platform may reach. Each entry declares
   `enabled`, `robotsStatus`, and (if disabled) a mandatory `disabledReason`.
2. **`assertSourceEnabled()`** (`packages/provenance/src/index.ts`) is called by
   `PoliteFetcher.fetchText()`/`fetchJson()` before every single HTTP request.
   It throws if the source is `enabled: false` or `robotsStatus: "disallowed"`.
   There is no code path that bypasses this check — adapters cannot call
   `fetch()` directly; they only have access to `PoliteFetcher`.
3. **robots.txt is checked at runtime** (`packages/compliance/src/robots.ts`)
   for any source whose `robotsStatus` is `"allowed"` (i.e., we still verify
   live, since robots.txt can change), with a longest-match-wins parser
   supporting `Allow`/`Disallow`/`Crawl-delay`.
4. **Rate limiting is enforced per-source** (`packages/compliance/src/rateLimiter.ts`),
   using the Source Registry's configured `minRequestIntervalMs`.
5. **A circuit breaker** (`packages/compliance/src/circuitBreaker.ts`) stops
   the platform from hammering a source that starts failing/blocking — after
   5 consecutive failures it opens for 5 minutes before allowing a single
   half-open probe.
6. **An honest User-Agent** is always sent (`HTTP_USER_AGENT` config,
   identifying the project and its purpose), never spoofed to impersonate a
   browser or bypass server-side bot detection.
7. **All adapter tests use recorded fixtures or well-known public endpoints**,
   never designed to hit ToS-forbidden targets (see `031_TESTING.md`).

## What "compliant" means for each acquisition method

| Method | Compliance basis |
|---|---|
| Official public API (FRED, SEC EDGAR, Binance public REST) | Explicitly documented by the provider for this exact use case; no auth bypass; respects documented rate limits. |
| Public JSON endpoint (Yahoo chart API) | Unofficial but genuinely public (no auth wall, no login, no CAPTCHA to defeat); long-established low-volume research/personal use pattern; honest UA; polite rate limiting; cached aggressively to minimize load. |
| CSV/flat-file download (Stooq, NSE/BSE bhavcopy) | Explicitly published by the source as a downloadable file for public consumption; not scraped from rendered HTML. |
| RSS/Atom feed | Syndication feeds exist specifically to be consumed by aggregators; this is the intended use case, not a workaround. |

## What is explicitly excluded and why (see also `004a_DATA_SOURCES.md`)

Both TradingView and X/Twitter are excluded not because their data wouldn't be
useful, but because reaching it would require violating a stated ToS
prohibition on automated access. The Source Registry marks them
`enabled: false` with the reason on record; any future attempt to add an
adapter for them must first change this registry entry, and only in response
to a genuine change in the underlying ToS (e.g., an official partner API
becoming available) — not by relaxing this document's rule.

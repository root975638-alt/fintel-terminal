# 009 — News Intelligence Engine

## Purpose

Fetch financial news from the already-compliant RSS/Atom adapters, enrich
with sentiment scoring and instrument entity-linking, and persist — as a
thin orchestration layer over independently-tested, deterministic heuristics.

## Architecture

```
services/news/src/
  sentiment.ts       Lexicon-based sentiment scorer with negation handling
  entityLinking.ts    Deterministic ticker/company-name matching
  newsService.ts       Wires RSS feeds -> sentiment + entity linking -> persistence
```

## A real bug this milestone found and fixed: dead feed hangs

**`fintel news` hung for 60-90+ seconds** instead of returning quickly. Root
cause: `PoliteFetcher`'s retry loop was calling `rateLimiter.acquire()` on
**every retry attempt**, not just once per logical fetch. For a source with a
large `minRequestIntervalMs` (Reuters' RSS entry: 30,000ms — a reasonable
inter-poll interval for a 5-minute-cadence feed), a failed first attempt
followed by a retry would have to wait the *entire* 30-second interval again
before the retry could even begin, compounding across all retry attempts.
**Fixed** by acquiring the rate limiter once per `fetchText()` call (governing
spacing between separate polling cycles) rather than once per retry attempt
(which only needs the much shorter exponential backoff). A regression test
(`packages/compliance/test/politeFetcherRetry.test.ts`) asserts a failing
fetch with `minRequestIntervalMs=30000` completes in under 5 seconds, not 60+.

Separately, `feeds.reuters.com` itself turned out to be genuinely dead (DNS/
connection failure, confirmed via direct curl) — not a compliance issue, just
a stale URL. `NewsService.fetchAndEnrich()` now isolates each feed in its own
try/catch: **a dead feed is logged as an explicit `feedErrors` entry and
skipped, never allowed to silently abort the other feeds** (spec: graceful
degradation, never silent). This is directly tested in
`newsService.node-test.ts`.

## Sentiment scoring (`EXPERIMENTAL`, explicitly not an NLP model)

A hand-built positive/negative word-list scorer with a simple negation
window (a negation word within 3 tokens before a sentiment word flips its
polarity — e.g. "not profitable" scores negative, "no losses" scores
positive). This is auditable (every score traces back to which words
matched) but will misclassify sarcasm, complex negation, and financial
idioms a lexicon can't capture. 8 unit tests verify the negation logic and
basic polarity classification.

## Entity linking (`EXPERIMENTAL`, explicitly not NLP-based NER)

Matches headline+summary text against a known instrument catalogue by (a)
ticker symbol as a whole word (avoiding false-positives like matching "A"
inside ordinary words) and (b) company display name with common corporate
suffixes stripped ("Apple Inc." -> "apple"). 8 unit tests cover word-boundary
enforcement, multi-instrument matches, and case-insensitivity.

## Real output (live, not fabricated)

Running `fintel news` against the live feeds (Reuters excluded — dead;
MarketWatch and Yahoo working):

```
SK Hynix raises $26.5 billion in U.S. offering. What to know about the stock.
  2026-07-10T02:38:00.000Z  rss-marketwatch-topstories  sentiment=neutral  quality=delayed

Taco Bell is reportedly pulling produce from some stores. Here's what to know.
  2026-07-09T22:30:00.000Z  rss-marketwatch-topstories  sentiment=neutral  quality=delayed
```

Both scored `neutral` — an honest result, since neither headline contains
words from the lexicon's positive/negative lists. This illustrates the
lexicon approach's real limitation: it will report "neutral" for plenty of
headlines a human would read as having clear implications, simply because
the specific words used aren't in the list.

## Follow-on work (not built in this milestone)

- Expand the sentiment lexicon (currently ~65 words total) and add
  domain-specific phrase patterns beyond single-word matching
- Replace/augment with a real NLP model in the (future) AI Engine, with the
  lexicon kept as a fast, dependency-free fallback
- Entity linking via a proper symbol-master database instead of the 5-item
  seed catalogue
- Reinstate or replace the dead Reuters feed with a working alternative

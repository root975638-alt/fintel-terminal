/**
 * SOURCE REGISTRY — the canonical, enforced catalogue of every external data source
 * this platform may reach. This is the single point of truth referenced by:
 *   - docs/004a_DATA_SOURCES.md (human-readable mirror of this file)
 *   - docs/004b_SCRAPING_COMPLIANCE.md (rationale for enabled/disabled decisions)
 *   - services/data-acquisition adapters (MUST call assertSourceEnabled() before any fetch)
 *
 * Adding a new source means adding an entry here FIRST, with an honest robots/ToS
 * assessment, before any adapter code is written against it. Sources are never
 * silently added or silently bypassed.
 */
import type { SourceRegistryEntry } from "@fintel/provenance";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

export const SOURCE_REGISTRY: readonly SourceRegistryEntry[] = [
  // ---------------------------------------------------------------------------
  // ENABLED — genuinely free, compliant, no ToS bypass required
  // ---------------------------------------------------------------------------
  {
    sourceId: "yahoo-chart-api",
    displayName: "Yahoo Finance (public chart/quote JSON endpoint)",
    method: "public-json-endpoint",
    url: "https://query1.finance.yahoo.com/v8/finance/chart/{symbol}",
    license: "Unofficial public endpoint; no authentication required; widely used by open-source " +
      "libraries (e.g. yfinance) under fair, low-volume, non-commercial-research use. No SLA. " +
      "Historical price/quote data only, not resold or redistributed in bulk.",
    enabled: true,
    robotsStatus: "not-applicable", // JSON API endpoint, not HTML page scraping
    expectedCadenceMs: 15 * MINUTE, // treat as delayed unless proven otherwise
    minRequestIntervalMs: 2_000,
  },
  {
    sourceId: "stooq-csv",
    displayName: "Stooq.com free historical CSV export",
    method: "csv-download",
    url: "https://stooq.com/q/d/l/?s={symbol}&i=d",
    license: "Free CSV export exists, but Stooq's own robots.txt disallows all paths for general " +
      "user-agents (only Googlebot/Bingbot are allowlisted) — verified live at https://stooq.com/robots.txt. " +
      "Disabled per this platform's own robots.txt enforcement; not usable without Stooq's explicit permission.",
    enabled: false,
    disabledReason:
      "robots.txt at stooq.com disallows \"/\" for all user-agents except Googlebot/Bingbot (verified live). " +
      "This was initially miscategorized as allowed; corrected after the platform's own compliance check " +
      "(assertSourceEnabled + robots.txt fetch) caught the conflict at runtime. Kept disabled until Stooq " +
      "grants explicit permission or publishes an official API.",
    robotsStatus: "disallowed",
    expectedCadenceMs: DAY,
    minRequestIntervalMs: 3_000,
  },
  {
    sourceId: "rss-reuters-business",
    displayName: "Reuters Business News RSS",
    method: "rss-atom",
    url: "https://feeds.reuters.com/reuters/businessNews",
    license: "Publicly syndicated RSS feed intended for subscription/aggregation.",
    enabled: true,
    robotsStatus: "not-applicable",
    expectedCadenceMs: 5 * MINUTE,
    minRequestIntervalMs: 30_000,
  },
  {
    sourceId: "rss-marketwatch-topstories",
    displayName: "MarketWatch Top Stories RSS",
    method: "rss-atom",
    url: "https://feeds.content.dowjones.io/public/rss/mw_topstories",
    license: "Publicly syndicated RSS feed.",
    enabled: true,
    robotsStatus: "not-applicable",
    expectedCadenceMs: 5 * MINUTE,
    minRequestIntervalMs: 30_000,
  },
  {
    sourceId: "rss-yahoo-finance-headlines",
    displayName: "Yahoo Finance headline RSS",
    method: "rss-atom",
    url: "https://finance.yahoo.com/news/rssindex",
    license: "Publicly syndicated RSS feed.",
    enabled: true,
    robotsStatus: "not-applicable",
    expectedCadenceMs: 5 * MINUTE,
    minRequestIntervalMs: 30_000,
  },
  {
    sourceId: "rss-google-news-finance",
    displayName: "Google News — Finance topic RSS",
    method: "rss-atom",
    url: "https://news.google.com/rss/search?q={query}&hl=en-US&gl=US&ceid=US:en",
    license: "Publicly syndicated RSS feed provided by Google News for aggregation.",
    enabled: true,
    robotsStatus: "not-applicable",
    expectedCadenceMs: 10 * MINUTE,
    minRequestIntervalMs: 30_000,
  },
  {
    sourceId: "fred-api",
    displayName: "FRED — Federal Reserve Economic Data (St. Louis Fed)",
    method: "public-api",
    url: "https://api.stlouisfed.org/fred/series/observations",
    license: "Free public API; requires a free registration API key; official US government economic data.",
    enabled: true,
    robotsStatus: "not-applicable",
    expectedCadenceMs: DAY,
    minRequestIntervalMs: 500,
  },
  {
    sourceId: "sec-edgar-api",
    displayName: "SEC EDGAR — company facts / filings JSON API",
    method: "public-api",
    url: "https://data.sec.gov/api/xbrl/companyfacts/CIK{cik}.json",
    license: "Official US government open data; SEC explicitly documents fair-access API use " +
      "(requires a descriptive User-Agent identifying the requester, per SEC's own developer guidance).",
    enabled: true,
    robotsStatus: "allowed",
    expectedCadenceMs: DAY,
    minRequestIntervalMs: 300, // SEC requests <=10 req/sec; we stay far under that
  },
  {
    sourceId: "binance-public-rest",
    displayName: "Binance public market-data REST API",
    method: "public-api",
    url: "https://api.binance.com/api/v3/klines",
    license: "Explicitly public, unauthenticated market-data endpoints documented by Binance for general use.",
    enabled: true,
    robotsStatus: "not-applicable",
    expectedCadenceMs: MINUTE,
    minRequestIntervalMs: 250,
  },
  {
    sourceId: "nse-india-bhavcopy",
    displayName: "NSE India — daily bhavcopy (official EOD data files)",
    method: "csv-download",
    url: "https://archives.nseindia.com/products/content/sec_bhavdata_full_{date}.csv",
    license: "Published by NSE itself as a downloadable public EOD data file for general use.",
    enabled: true,
    robotsStatus: "allowed",
    expectedCadenceMs: DAY,
    minRequestIntervalMs: 3_000,
  },
  {
    sourceId: "bse-india-bhavcopy",
    displayName: "BSE India — daily bhavcopy (official EOD data files)",
    method: "csv-download",
    url: "https://www.bseindia.com/download/BhavCopy/Equity/EQ_ISIN_{date}.zip",
    license: "Published by BSE itself as a downloadable public EOD data file for general use.",
    enabled: true,
    robotsStatus: "allowed",
    expectedCadenceMs: DAY,
    minRequestIntervalMs: 3_000,
  },

  // ---------------------------------------------------------------------------
  // DISABLED — ToS-restricted. NOT silently dropped: logged here with reason,
  // and any adapter attempting to use these MUST fail loudly via assertSourceEnabled().
  // ---------------------------------------------------------------------------
  {
    sourceId: "tradingview-web",
    displayName: "TradingView (charts/screener/community data)",
    method: "public-json-endpoint",
    url: "https://www.tradingview.com",
    license: "TradingView's Terms of Use explicitly prohibit scraping, automated data extraction, and " +
      "unauthorized redistribution of its data/content.",
    enabled: false,
    disabledReason:
      "ToS forbids automated/scraped access; TradingView has pursued legal action against scrapers. " +
      "Excluded per platform Section 0 compliance mandate — no bypass will be implemented regardless of " +
      "stated testing intent.",
    robotsStatus: "disallowed",
    expectedCadenceMs: MINUTE,
    minRequestIntervalMs: 0,
  },
  {
    sourceId: "x-twitter",
    displayName: "X (formerly Twitter)",
    method: "public-json-endpoint",
    url: "https://x.com",
    license: "X's Terms of Service explicitly prohibit scraping without a paid, authorized API agreement.",
    enabled: false,
    disabledReason:
      "ToS forbids scraping; X has a documented history of litigation against unauthorized scrapers " +
      "(e.g. against data-scraping firms). Excluded per platform Section 0 compliance mandate.",
    robotsStatus: "disallowed",
    expectedCadenceMs: MINUTE,
    minRequestIntervalMs: 0,
  },
];

export function getSourceEntry(sourceId: string): SourceRegistryEntry {
  const entry = SOURCE_REGISTRY.find((s) => s.sourceId === sourceId);
  if (!entry) {
    throw new Error(`Unknown sourceId "${sourceId}" — it must be registered in SOURCE_REGISTRY before use.`);
  }
  return entry;
}

export function listEnabledSources(): readonly SourceRegistryEntry[] {
  return SOURCE_REGISTRY.filter((s) => s.enabled);
}

export function listDisabledSources(): readonly SourceRegistryEntry[] {
  return SOURCE_REGISTRY.filter((s) => !s.enabled);
}

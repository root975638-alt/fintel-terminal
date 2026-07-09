import { PoliteFetcher } from "@fintel/compliance";
import type { AppConfig } from "@fintel/config";
import { YahooAdapter } from "./adapters/yahooAdapter.js";
import { StooqAdapter } from "./adapters/stooqAdapter.js";
import { RssAdapter } from "./adapters/rssAdapter.js";
import { FredAdapter } from "./adapters/fredAdapter.js";
import { SecEdgarAdapter } from "./adapters/secEdgarAdapter.js";
import { BinanceAdapter } from "./adapters/binanceAdapter.js";
import { NseIndiaAdapter } from "./adapters/nseIndiaAdapter.js";

export * from "./ports.js";
export * from "./adapters/yahooAdapter.js";
export * from "./adapters/stooqAdapter.js";
export * from "./adapters/rssAdapter.js";
export * from "./adapters/fredAdapter.js";
export * from "./adapters/secEdgarAdapter.js";
export * from "./adapters/binanceAdapter.js";
export * from "./adapters/nseIndiaAdapter.js";

/** Wires up a PoliteFetcher and every compliant adapter from validated app config. */
export function createDataAcquisitionLayer(config: AppConfig) {
  const fetcher = new PoliteFetcher({
    userAgent: config.HTTP_USER_AGENT,
    timeoutMs: config.HTTP_TIMEOUT_MS,
    cacheDir: config.HTTP_CACHE_DIR,
    defaultCacheTtlMs: config.HTTP_CACHE_DEFAULT_TTL_MS,
  });

  return {
    fetcher,
    yahoo: new YahooAdapter(fetcher),
    // NOTE: StooqAdapter class remains implemented and exported for potential future use,
    // but is NOT wired up here — "stooq-csv" is disabled in the Source Registry because
    // Stooq's robots.txt disallows all non-Googlebot/Bingbot user-agents (verified live).
    binance: new BinanceAdapter(fetcher),
    nseIndia: new NseIndiaAdapter(fetcher),
    secEdgar: new SecEdgarAdapter(fetcher),
    fred: new FredAdapter(fetcher, config.FRED_API_KEY),
    newsFeeds: [
      new RssAdapter("rss-reuters-business", "https://feeds.reuters.com/reuters/businessNews", fetcher),
      new RssAdapter(
        "rss-marketwatch-topstories",
        "https://feeds.content.dowjones.io/public/rss/mw_topstories",
        fetcher,
      ),
      new RssAdapter("rss-yahoo-finance-headlines", "https://finance.yahoo.com/news/rssindex", fetcher),
    ],
  };
}

export type DataAcquisitionLayer = ReturnType<typeof createDataAcquisitionLayer>;

/**
 * News Intelligence service — fetches from the already-built RSS adapters,
 * scores sentiment (lexicon heuristic), links entities (deterministic string
 * match), and persists via the existing news_items repository (added in
 * Milestone 1). This is intentionally a thin orchestration layer: all the
 * actual logic lives in sentiment.ts/entityLinking.ts, independently tested.
 */
import type { NewsItem, Instrument } from "@fintel/domain";
import type { NewsSourcePort } from "@fintel/data-acquisition";
import type { PersistenceLayer } from "@fintel/persistence";
import { scoreSentiment } from "./sentiment.js";
import { linkEntities } from "./entityLinking.js";

export interface NewsServiceOptions {
  readonly feeds: readonly NewsSourcePort[];
  readonly persistence: PersistenceLayer;
  readonly instrumentCatalogue: readonly Instrument[];
}

export class NewsService {
  constructor(private readonly opts: NewsServiceOptions) {}

  /**
   * Fetches all configured feeds, enriches with sentiment + entity links,
   * persists, and returns the enriched items. Each feed is fetched
   * independently — one feed failing (dead URL, network error, source
   * temporarily blocking us) is logged as an explicit warning and skipped,
   * never allowed to silently abort the other feeds.
   */
  async fetchAndEnrich(): Promise<{ items: readonly NewsItem[]; feedErrors: readonly { sourceId: string; message: string }[] }> {
    const allItems: NewsItem[] = [];
    const feedErrors: { sourceId: string; message: string }[] = [];

    for (const feed of this.opts.feeds) {
      let rawItems;
      try {
        rawItems = await feed.fetchNews({});
      } catch (err) {
        feedErrors.push({ sourceId: feed.sourceId, message: (err as Error).message });
        continue;
      }
      for (const item of rawItems) {
        const textToScore = `${item.headline} ${item.summary ?? ""}`;
        const sentimentResult = scoreSentiment(textToScore);
        const entityResult = linkEntities(textToScore, this.opts.instrumentCatalogue);

        allItems.push({
          ...item,
          sentiment: sentimentResult.sentiment,
          sentimentScore: sentimentResult.score,
          relatedInstrumentIds: entityResult.relatedInstrumentIds,
        });
      }
    }

    if (allItems.length > 0) {
      await this.opts.persistence.news.upsertMany(allItems);
    }
    return { items: allItems, feedErrors };
  }

  async recent(limit = 50): Promise<readonly NewsItem[]> {
    return this.opts.persistence.news.recent(limit);
  }

  async forInstrument(instrumentId: string, limit = 50): Promise<readonly NewsItem[]> {
    return this.opts.persistence.news.forInstrument(instrumentId, limit);
  }
}

export * from "./sentiment.js";
export * from "./entityLinking.js";

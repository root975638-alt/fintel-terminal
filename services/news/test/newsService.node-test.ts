import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import type { NewsItem, Instrument } from "@fintel/domain";
import { epochMillis } from "@fintel/money-time";
import { openPersistenceLayer, type PersistenceLayer } from "@fintel/persistence";
import { NewsService } from "../src/newsService.js";
import type { NewsSourcePort } from "@fintel/data-acquisition";

const catalogue: readonly Instrument[] = [
  {
    instrumentId: "US_EQUITIES:AAPL",
    market: "US_EQUITIES",
    symbol: "AAPL",
    assetClass: "equity",
    displayName: "Apple Inc.",
    currency: "USD",
    active: true,
  },
];

function mockNewsItem(id: string, headline: string): NewsItem {
  return {
    newsId: id,
    headline,
    url: `https://example.com/${id}`,
    publishedAtMs: epochMillis(Date.now()),
    sourceName: "mock-feed",
    relatedInstrumentIds: [],
    provenance: {
      source: { sourceId: "mock-feed", displayName: "Mock Feed", method: "rss-atom", url: "", license: "" },
      fetchedAtMs: Date.now(),
      asOfMs: Date.now(),
      quality: "delayed",
    },
  };
}

/** A fixture feed that returns a fixed set of items — no live network. */
function createFixtureFeed(sourceId: string, items: readonly NewsItem[]): NewsSourcePort {
  return { sourceId, fetchNews: async () => items };
}

/** A fixture feed that always throws, simulating a dead/blocked source. */
function createFailingFeed(sourceId: string): NewsSourcePort {
  return {
    sourceId,
    fetchNews: async () => {
      throw new Error("simulated network failure");
    },
  };
}

describe("NewsService (fixture-based, no live network)", () => {
  let persistence: PersistenceLayer;

  beforeEach(() => {
    persistence = openPersistenceLayer(":memory:");
  });

  afterEach(() => {
    persistence.close();
  });

  it("enriches fetched items with sentiment and entity links, then persists them", async () => {
    const feed = createFixtureFeed("mock-feed", [mockNewsItem("1", "Apple profits surge on record iPhone sales")]);
    const service = new NewsService({ feeds: [feed], persistence, instrumentCatalogue: catalogue });

    const { items, feedErrors } = await service.fetchAndEnrich();
    assert.strictEqual(feedErrors.length, 0);
    assert.strictEqual(items.length, 1);
    assert.ok(items[0]!.sentiment === "positive" || items[0]!.sentiment === "very-positive");
    assert.ok(items[0]!.relatedInstrumentIds.includes("US_EQUITIES:AAPL"));

    const persisted = await persistence.news.recent(10);
    assert.strictEqual(persisted.length, 1);
  });

  it("isolates a failing feed — other feeds still succeed and the error is reported, not thrown", async () => {
    const goodFeed = createFixtureFeed("good-feed", [mockNewsItem("2", "Market update")]);
    const badFeed = createFailingFeed("bad-feed");
    const service = new NewsService({ feeds: [badFeed, goodFeed], persistence, instrumentCatalogue: catalogue });

    const { items, feedErrors } = await service.fetchAndEnrich();
    assert.strictEqual(items.length, 1); // good feed's item still came through
    assert.strictEqual(feedErrors.length, 1);
    assert.strictEqual(feedErrors[0]!.sourceId, "bad-feed");
  });

  it("returns recent items via the persistence-backed recent() method", async () => {
    const feed = createFixtureFeed("mock-feed", [
      mockNewsItem("3", "Neutral scheduling announcement"),
      mockNewsItem("4", "Another neutral item"),
    ]);
    const service = new NewsService({ feeds: [feed], persistence, instrumentCatalogue: catalogue });
    await service.fetchAndEnrich();

    const recent = await service.recent(10);
    assert.strictEqual(recent.length, 2);
  });
});

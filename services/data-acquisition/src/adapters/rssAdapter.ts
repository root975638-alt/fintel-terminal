/**
 * RSS/Atom news adapter — fetches syndicated feeds (Reuters, MarketWatch, Yahoo,
 * Google News finance search) and normalizes both RSS 2.0 and Atom formats into
 * NewsItem records. Entity/ticker linking and sentiment scoring are deliberately
 * NOT done here (that's the News Intelligence service's job in a later milestone);
 * this adapter's only responsibility is honest acquisition + normalization.
 */
import { createHash } from "node:crypto";
import { XMLParser } from "fast-xml-parser";
import { PoliteFetcher } from "@fintel/compliance";
import { getSourceEntry } from "@fintel/config";
import type { NewsItem } from "@fintel/domain";
import { epochMillis, fromIso } from "@fintel/money-time";
import type { ProvenanceRecord } from "@fintel/provenance";
import type { NewsQuery, NewsSourcePort } from "../ports.js";

const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_" });

function newsId(url: string, headline: string): string {
  return createHash("sha256").update(`${url}|${headline}`).digest("hex").slice(0, 24);
}

function safeDate(value: unknown): number {
  if (typeof value !== "string") return Date.now();
  try {
    return fromIso(new Date(value).toISOString());
  } catch {
    return Date.now();
  }
}

function asArray<T>(value: T | T[] | undefined): T[] {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

export class RssAdapter implements NewsSourcePort {
  constructor(
    readonly sourceId: string, // e.g. "rss-reuters-business" — must match a SOURCE_REGISTRY entry
    private readonly feedUrl: string,
    private readonly fetcher: PoliteFetcher,
  ) {}

  async fetchNews(_query: NewsQuery): Promise<readonly NewsItem[]> {
    const source = getSourceEntry(this.sourceId);
    const { body, fetchedAtMs, fromCache } = await this.fetcher.fetchText(this.feedUrl, source, {
      cacheTtlMs: 5 * 60_000,
    });

    const parsed = parser.parse(body) as Record<string, unknown>;
    const provenance: ProvenanceRecord = {
      source,
      fetchedAtMs,
      asOfMs: fetchedAtMs,
      quality: "delayed",
      note: fromCache ? "served from local politeness cache" : undefined,
    };

    // RSS 2.0: rss.channel.item[]
    const rssChannel = (parsed as { rss?: { channel?: Record<string, unknown> } }).rss?.channel;
    if (rssChannel) {
      const items = asArray(rssChannel.item as Record<string, unknown> | Record<string, unknown>[] | undefined);
      return items.map((item) => this.toNewsItemFromRss(item, provenance));
    }

    // Atom: feed.entry[]
    const atomFeed = (parsed as { feed?: { entry?: unknown } }).feed;
    if (atomFeed) {
      const entries = asArray(atomFeed.entry as Record<string, unknown> | Record<string, unknown>[] | undefined);
      return entries.map((entry) => this.toNewsItemFromAtom(entry, provenance));
    }

    return [];
  }

  private toNewsItemFromRss(item: Record<string, unknown>, provenance: ProvenanceRecord): NewsItem {
    const headline = String(item.title ?? "");
    const url = String(item.link ?? "");
    const publishedAtMs = epochMillis(safeDate(item.pubDate));
    return {
      newsId: newsId(url, headline),
      headline,
      summary: typeof item.description === "string" ? item.description : undefined,
      url,
      publishedAtMs,
      sourceName: this.sourceId,
      relatedInstrumentIds: [],
      provenance,
    };
  }

  private toNewsItemFromAtom(entry: Record<string, unknown>, provenance: ProvenanceRecord): NewsItem {
    const headline = typeof entry.title === "object" ? String((entry.title as { "#text"?: string })["#text"] ?? "") : String(entry.title ?? "");
    const linkField = entry.link as { "@_href"?: string } | Array<{ "@_href"?: string }> | undefined;
    const url = Array.isArray(linkField) ? (linkField[0]?.["@_href"] ?? "") : (linkField?.["@_href"] ?? "");
    const publishedAtMs = epochMillis(safeDate(entry.published ?? entry.updated));
    return {
      newsId: newsId(url, headline),
      headline,
      summary: typeof entry.summary === "string" ? entry.summary : undefined,
      url,
      publishedAtMs,
      sourceName: this.sourceId,
      relatedInstrumentIds: [],
      provenance,
    };
  }
}

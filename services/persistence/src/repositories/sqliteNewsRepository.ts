import { DatabaseSync } from "node:sqlite";
import type { NewsItem, NewsSentiment } from "@fintel/domain";
import { epochMillis } from "@fintel/money-time";
import type { ProvenanceRecord, QualityTag } from "@fintel/provenance";
import { getSourceEntry } from "@fintel/config";
import type { NewsRepository } from "./ports.js";

export class SqliteNewsRepository implements NewsRepository {
  constructor(private readonly db: DatabaseSync) {}

  async upsertMany(items: readonly NewsItem[]): Promise<void> {
    if (items.length === 0) return;
    const stmt = this.db.prepare(
      `INSERT INTO news_items (news_id, headline, summary, url, published_at_ms, source_name,
                                related_instrument_ids, sentiment, sentiment_score,
                                source_id, fetched_at_ms, as_of_ms, quality, quality_note)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(news_id) DO UPDATE SET
         sentiment=excluded.sentiment, sentiment_score=excluded.sentiment_score,
         related_instrument_ids=excluded.related_instrument_ids`,
    );
    this.db.exec("BEGIN");
    try {
      for (const item of items) {
        stmt.run(
          item.newsId,
          item.headline,
          item.summary ?? null,
          item.url,
          item.publishedAtMs,
          item.sourceName,
          JSON.stringify(item.relatedInstrumentIds),
          item.sentiment ?? null,
          item.sentimentScore ?? null,
          item.provenance.source.sourceId,
          item.provenance.fetchedAtMs,
          item.provenance.asOfMs,
          item.provenance.quality,
          item.provenance.note ?? null,
        );
      }
      this.db.exec("COMMIT");
    } catch (err) {
      this.db.exec("ROLLBACK");
      throw err;
    }
  }

  async recent(limit: number): Promise<readonly NewsItem[]> {
    const rows = this.db
      .prepare("SELECT * FROM news_items ORDER BY published_at_ms DESC LIMIT ?")
      .all(limit) as Record<string, unknown>[];
    return rows.map(rowToNewsItem);
  }

  async forInstrument(instrumentId: string, limit: number): Promise<readonly NewsItem[]> {
    // related_instrument_ids stored as JSON array text; LIKE match is a pragmatic filter
    // for the vertical-slice milestone (a proper join table is a follow-on improvement).
    const rows = this.db
      .prepare(
        "SELECT * FROM news_items WHERE related_instrument_ids LIKE ? ORDER BY published_at_ms DESC LIMIT ?",
      )
      .all(`%"${instrumentId}"%`, limit) as Record<string, unknown>[];
    return rows.map(rowToNewsItem);
  }
}

function rowToNewsItem(row: Record<string, unknown>): NewsItem {
  const sourceId = String(row.source_id);
  let source;
  try {
    source = getSourceEntry(sourceId);
  } catch {
    source = { sourceId, displayName: sourceId, method: "rss-atom" as const, url: "", license: "" };
  }
  const provenance: ProvenanceRecord = {
    source,
    fetchedAtMs: Number(row.fetched_at_ms),
    asOfMs: Number(row.as_of_ms),
    quality: row.quality as QualityTag,
    note: row.quality_note ? String(row.quality_note) : undefined,
  };
  return {
    newsId: String(row.news_id),
    headline: String(row.headline),
    summary: row.summary ? String(row.summary) : undefined,
    url: String(row.url),
    publishedAtMs: epochMillis(Number(row.published_at_ms)),
    sourceName: String(row.source_name),
    relatedInstrumentIds: JSON.parse(String(row.related_instrument_ids)) as string[],
    sentiment: row.sentiment ? (String(row.sentiment) as NewsSentiment) : undefined,
    sentimentScore: row.sentiment_score !== null && row.sentiment_score !== undefined ? Number(row.sentiment_score) : undefined,
    provenance,
  };
}

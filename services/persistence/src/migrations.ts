import type { Migration } from "./migrationRunner.js";

/**
 * Migration 001 — core schema for the vertical-slice milestone: instruments,
 * bars, quotes, news items, and signals. Prices/volumes stored as TEXT to
 * preserve exact decimal precision (consumed via @fintel/money-time Money on
 * the way in/out — never parsed as a float inside this layer).
 */
export const MIGRATIONS: readonly Migration[] = [
  {
    version: 1,
    name: "core_schema",
    sql: `
      CREATE TABLE instruments (
        instrument_id   TEXT PRIMARY KEY,
        market          TEXT NOT NULL,
        symbol          TEXT NOT NULL,
        asset_class     TEXT NOT NULL,
        display_name    TEXT NOT NULL,
        currency        TEXT NOT NULL,
        exchange_mic    TEXT,
        isin            TEXT,
        active          INTEGER NOT NULL DEFAULT 1
      );

      CREATE TABLE bars (
        instrument_id     TEXT NOT NULL,
        timeframe         TEXT NOT NULL,
        bucket_start_ms   INTEGER NOT NULL,
        open              TEXT NOT NULL,
        high              TEXT NOT NULL,
        low               TEXT NOT NULL,
        close             TEXT NOT NULL,
        volume            TEXT NOT NULL,
        adjusted          INTEGER NOT NULL,
        source_id         TEXT NOT NULL,
        fetched_at_ms     INTEGER NOT NULL,
        as_of_ms          INTEGER NOT NULL,
        quality           TEXT NOT NULL,
        quality_note      TEXT,
        PRIMARY KEY (instrument_id, timeframe, bucket_start_ms)
      );
      CREATE INDEX idx_bars_instrument_tf ON bars (instrument_id, timeframe, bucket_start_ms);

      CREATE TABLE quotes (
        instrument_id     TEXT NOT NULL,
        ts_ms             INTEGER NOT NULL,
        last              TEXT,
        bid               TEXT,
        ask               TEXT,
        bid_size          TEXT,
        ask_size          TEXT,
        day_open          TEXT,
        day_high          TEXT,
        day_low           TEXT,
        previous_close    TEXT,
        volume            TEXT,
        source_id         TEXT NOT NULL,
        fetched_at_ms     INTEGER NOT NULL,
        as_of_ms          INTEGER NOT NULL,
        quality           TEXT NOT NULL,
        quality_note      TEXT,
        PRIMARY KEY (instrument_id, ts_ms)
      );
      CREATE INDEX idx_quotes_instrument_latest ON quotes (instrument_id, ts_ms DESC);

      CREATE TABLE news_items (
        news_id                 TEXT PRIMARY KEY,
        headline                TEXT NOT NULL,
        summary                 TEXT,
        url                     TEXT NOT NULL,
        published_at_ms         INTEGER NOT NULL,
        source_name             TEXT NOT NULL,
        related_instrument_ids  TEXT NOT NULL, -- JSON array
        sentiment               TEXT,
        sentiment_score         REAL,
        source_id               TEXT NOT NULL,
        fetched_at_ms           INTEGER NOT NULL,
        as_of_ms                INTEGER NOT NULL,
        quality                 TEXT NOT NULL,
        quality_note            TEXT
      );
      CREATE INDEX idx_news_published ON news_items (published_at_ms DESC);

      CREATE TABLE signals (
        signal_id         TEXT PRIMARY KEY,
        instrument_id     TEXT NOT NULL,
        strategy_id       TEXT NOT NULL,
        direction         TEXT NOT NULL,
        score             REAL NOT NULL,
        confidence        REAL NOT NULL,
        expected_value    REAL,
        rationale         TEXT NOT NULL,
        honesty_label     TEXT NOT NULL,
        generated_at_ms   INTEGER NOT NULL,
        quality           TEXT NOT NULL,
        provenance_json   TEXT NOT NULL -- full DerivedProvenance, JSON-serialized
      );
      CREATE INDEX idx_signals_instrument ON signals (instrument_id, generated_at_ms DESC);
    `,
  },
];

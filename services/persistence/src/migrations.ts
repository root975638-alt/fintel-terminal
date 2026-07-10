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
  {
    version: 2,
    name: "backtest_runs",
    sql: `
      CREATE TABLE backtest_runs (
        run_id                TEXT PRIMARY KEY,
        instrument_id         TEXT NOT NULL,
        strategy_id           TEXT NOT NULL,
        run_at_ms             INTEGER NOT NULL,
        in_sample_fraction    REAL NOT NULL,
        initial_capital       REAL NOT NULL,
        cost_model_json       TEXT NOT NULL,
        is_bar_count          INTEGER NOT NULL,
        is_trade_count        INTEGER NOT NULL,
        is_total_return_pct   REAL NOT NULL,
        is_sharpe_ratio       REAL,
        is_max_drawdown_pct   REAL NOT NULL,
        oos_bar_count         INTEGER NOT NULL,
        oos_trade_count       INTEGER NOT NULL,
        oos_total_return_pct  REAL NOT NULL,
        oos_sharpe_ratio      REAL,
        oos_max_drawdown_pct  REAL NOT NULL,
        oos_holds_up          INTEGER, -- NULL = insufficient OOS trades to judge; 0/1 otherwise
        promoted_label        TEXT NOT NULL, -- honesty label decision recorded for this run (never fabricated after the fact)
        full_report_json      TEXT NOT NULL -- complete WalkForwardReport, JSON-serialized, for audit/reproducibility
      );
      CREATE INDEX idx_backtest_runs_strategy ON backtest_runs (strategy_id, run_at_ms DESC);
      CREATE INDEX idx_backtest_runs_instrument ON backtest_runs (instrument_id, run_at_ms DESC);
    `,
  },
  {
    version: 3,
    name: "macro_observations",
    sql: `
      CREATE TABLE macro_observations (
        series_id       TEXT NOT NULL,
        date_ms         INTEGER NOT NULL,
        value           REAL, -- NULL = missing observation (source reported "." or similar), never fabricated
        fetched_at_ms   INTEGER NOT NULL,
        source_id       TEXT NOT NULL,
        PRIMARY KEY (series_id, date_ms)
      );
      CREATE INDEX idx_macro_observations_series ON macro_observations (series_id, date_ms DESC);
    `,
  },
];

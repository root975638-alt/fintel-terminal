/**
 * Persistence integration tests using Node's built-in test runner (node:test)
 * instead of vitest — Vite's dependency resolver cannot yet resolve the very new
 * `node:sqlite` built-in module (fails with "Failed to load url sqlite"), while
 * plain Node handles it natively without issue. This keeps the test real and
 * running in CI without needing a native SQLite binding or bundler workaround.
 */
import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { epochMillis, Timeframe } from "@fintel/money-time";
import type { Bar, Instrument } from "@fintel/domain";
import type { ProvenanceRecord } from "@fintel/provenance";
import { openPersistenceLayer, type PersistenceLayer } from "../src/index.js";

function provenance(): ProvenanceRecord {
  return {
    source: { sourceId: "stooq-csv", displayName: "Stooq", method: "csv-download", url: "", license: "" },
    fetchedAtMs: 1_700_000_000_000,
    asOfMs: 1_700_000_000_000,
    quality: "eod",
  };
}

describe("persistence integration (SQLite in-memory)", () => {
  let layer: PersistenceLayer;

  beforeEach(() => {
    layer = openPersistenceLayer(":memory:");
  });

  afterEach(() => {
    layer.close();
  });

  it("applies migrations idempotently (schema exists after open)", () => {
    const row = layer.db.prepare("SELECT COUNT(*) as count FROM schema_migrations").get() as { count: number };
    assert.ok(row.count > 0);
  });

  it("round-trips an Instrument through upsert/findById/list", async () => {
    const instrument: Instrument = {
      instrumentId: "US_EQUITIES:TEST",
      market: "US_EQUITIES",
      symbol: "TEST",
      assetClass: "equity",
      displayName: "Test Corp",
      currency: "USD",
      active: true,
    };
    await layer.instruments.upsert(instrument);
    const found = await layer.instruments.findById("US_EQUITIES:TEST");
    assert.strictEqual(found?.instrumentId, instrument.instrumentId);
    assert.strictEqual(found?.market, instrument.market);
    assert.strictEqual(found?.symbol, instrument.symbol);
    assert.strictEqual(found?.assetClass, instrument.assetClass);
    assert.strictEqual(found?.displayName, instrument.displayName);
    assert.strictEqual(found?.currency, instrument.currency);
    assert.strictEqual(found?.active, instrument.active);

    const all = await layer.instruments.list();
    assert.strictEqual(all.length, 1);
  });

  it("upsert is idempotent and updates on conflict", async () => {
    const instrument: Instrument = {
      instrumentId: "US_EQUITIES:TEST2",
      market: "US_EQUITIES",
      symbol: "TEST2",
      assetClass: "equity",
      displayName: "Original Name",
      currency: "USD",
      active: true,
    };
    await layer.instruments.upsert(instrument);
    await layer.instruments.upsert({ ...instrument, displayName: "Updated Name" });

    const found = await layer.instruments.findById("US_EQUITIES:TEST2");
    assert.strictEqual(found?.displayName, "Updated Name");

    const all = await layer.instruments.list();
    assert.strictEqual(all.length, 1); // no duplicate row
  });

  it("round-trips Bars, preserving exact decimal-string precision (no float corruption)", async () => {
    const bar: Bar = {
      instrumentId: "US_EQUITIES:TEST",
      timeframe: Timeframe.D1,
      bucketStartMs: epochMillis(1_700_000_000_000),
      open: "123.45600000",
      high: "125.00000001",
      low: "120.99999999",
      close: "124.00000000",
      volume: "1000000",
      adjusted: false,
      provenance: provenance(),
    };
    await layer.bars.upsertMany([bar]);
    const rows = await layer.bars.query({ instrumentId: "US_EQUITIES:TEST", timeframe: Timeframe.D1 });

    assert.strictEqual(rows.length, 1);
    assert.strictEqual(rows[0]!.open, "123.45600000"); // exact string equality, not Number() comparison
    assert.strictEqual(rows[0]!.high, "125.00000001");
    assert.strictEqual(rows[0]!.provenance.quality, "eod");
  });

  it("bar upsert on conflict updates rather than duplicating", async () => {
    const bar: Bar = {
      instrumentId: "US_EQUITIES:TEST",
      timeframe: Timeframe.D1,
      bucketStartMs: epochMillis(1_700_000_000_000),
      open: "100",
      high: "101",
      low: "99",
      close: "100.5",
      volume: "500",
      adjusted: false,
      provenance: provenance(),
    };
    await layer.bars.upsertMany([bar]);
    await layer.bars.upsertMany([{ ...bar, close: "102" }]);

    const rows = await layer.bars.query({ instrumentId: "US_EQUITIES:TEST", timeframe: Timeframe.D1 });
    assert.strictEqual(rows.length, 1);
    assert.strictEqual(rows[0]!.close, "102");
  });

  it("tracks the latest bucket start for gap-detection purposes", async () => {
    const bars: Bar[] = [1_700_000_000_000, 1_700_086_400_000, 1_700_172_800_000].map((ms, i) => ({
      instrumentId: "US_EQUITIES:TEST",
      timeframe: Timeframe.D1,
      bucketStartMs: epochMillis(ms),
      open: String(100 + i),
      high: String(101 + i),
      low: String(99 + i),
      close: String(100.5 + i),
      volume: "500",
      adjusted: false,
      provenance: provenance(),
    }));
    await layer.bars.upsertMany(bars);
    const latest = await layer.bars.latestBucketStart("US_EQUITIES:TEST", Timeframe.D1);
    assert.strictEqual(latest, 1_700_172_800_000);
  });

  it("filters bar queries by fromMs/toMs range", async () => {
    const bars: Bar[] = [1_700_000_000_000, 1_700_086_400_000, 1_700_172_800_000].map((ms, i) => ({
      instrumentId: "US_EQUITIES:TEST",
      timeframe: Timeframe.D1,
      bucketStartMs: epochMillis(ms),
      open: String(100 + i),
      high: String(101 + i),
      low: String(99 + i),
      close: String(100.5 + i),
      volume: "500",
      adjusted: false,
      provenance: provenance(),
    }));
    await layer.bars.upsertMany(bars);
    const filtered = await layer.bars.query({
      instrumentId: "US_EQUITIES:TEST",
      timeframe: Timeframe.D1,
      fromMs: 1_700_050_000_000,
      toMs: 1_700_172_800_000,
    });
    assert.strictEqual(filtered.length, 2);
  });
});

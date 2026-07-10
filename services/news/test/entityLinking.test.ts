import { describe, expect, it } from "vitest";
import type { Instrument } from "@fintel/domain";
import { linkEntities } from "../src/entityLinking.js";

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
  {
    instrumentId: "US_EQUITIES:MSFT",
    market: "US_EQUITIES",
    symbol: "MSFT",
    assetClass: "equity",
    displayName: "Microsoft Corporation",
    currency: "USD",
    active: true,
  },
  {
    instrumentId: "CRYPTO:BTCUSDT",
    market: "CRYPTO",
    symbol: "BTCUSDT",
    assetClass: "crypto",
    displayName: "Bitcoin / TetherUS",
    currency: "USDT",
    active: true,
  },
];

describe("linkEntities", () => {
  it("matches by ticker symbol as a whole word", () => {
    const result = linkEntities("AAPL shares rose today", catalogue);
    expect(result.relatedInstrumentIds).toContain("US_EQUITIES:AAPL");
  });

  it("matches by company display name (suffix-stripped)", () => {
    const result = linkEntities("Apple announced a new product line", catalogue);
    expect(result.relatedInstrumentIds).toContain("US_EQUITIES:AAPL");
  });

  it("matches Microsoft Corporation by its stripped short name", () => {
    const result = linkEntities("Microsoft reported quarterly earnings", catalogue);
    expect(result.relatedInstrumentIds).toContain("US_EQUITIES:MSFT");
  });

  it("does not match a ticker symbol embedded inside another word (word-boundary enforced)", () => {
    // "AAPLE" contains "AAPL" as a substring but should NOT match as a whole word
    const result = linkEntities("AAPLE is not a real company", catalogue);
    expect(result.relatedInstrumentIds).not.toContain("US_EQUITIES:AAPL");
  });

  it("returns multiple matches when several instruments are mentioned", () => {
    const result = linkEntities("Apple and Microsoft both rallied today", catalogue);
    expect(result.relatedInstrumentIds).toContain("US_EQUITIES:AAPL");
    expect(result.relatedInstrumentIds).toContain("US_EQUITIES:MSFT");
  });

  it("returns an empty array when no instrument is mentioned", () => {
    const result = linkEntities("The weather was sunny today", catalogue);
    expect(result.relatedInstrumentIds).toHaveLength(0);
  });

  it("is case-insensitive for both symbol and name matching", () => {
    const result = linkEntities("aapl shares and apple products", catalogue);
    expect(result.relatedInstrumentIds).toContain("US_EQUITIES:AAPL");
  });

  it("is always labeled EXPERIMENTAL", () => {
    const result = linkEntities("Apple news", catalogue);
    expect(result.honestyLabel).toBe("EXPERIMENTAL");
  });
});

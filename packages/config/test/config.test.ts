import { describe, expect, it } from "vitest";
import { loadConfig, resetConfigCache } from "../src/index.js";
import { SOURCE_REGISTRY, getSourceEntry, listEnabledSources, listDisabledSources } from "../src/sourceRegistry.js";

describe("loadConfig", () => {
  it("applies safe defaults when no env vars are set", () => {
    resetConfigCache();
    const config = loadConfig({});
    expect(config.DB_DRIVER).toBe("sqlite");
    expect(config.API_PORT).toBe(4310);
    expect(config.LOG_LEVEL).toBe("info");
  });

  it("respects overrides from the provided env object", () => {
    resetConfigCache();
    const config = loadConfig({ API_PORT: "8080", LOG_LEVEL: "debug" });
    expect(config.API_PORT).toBe(8080);
    expect(config.LOG_LEVEL).toBe("debug");
  });

  it("throws a descriptive error for an invalid enum value", () => {
    resetConfigCache();
    expect(() => loadConfig({ DB_DRIVER: "mongodb" })).toThrow(/DB_DRIVER/);
  });

  it("memoizes the config across calls until reset", () => {
    resetConfigCache();
    const first = loadConfig({ API_PORT: "1111" });
    const second = loadConfig({ API_PORT: "2222" }); // ignored — cached
    expect(second.API_PORT).toBe(first.API_PORT);
    resetConfigCache();
  });
});

describe("SOURCE_REGISTRY", () => {
  it("contains no duplicate sourceIds", () => {
    const ids = SOURCE_REGISTRY.map((s) => s.sourceId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("requires every disabled source to document a disabledReason", () => {
    for (const entry of listDisabledSources()) {
      expect(entry.disabledReason, `source "${entry.sourceId}" is disabled but has no reason`).toBeTruthy();
    }
  });

  it("marks TradingView and X/Twitter as disabled (ToS-restricted)", () => {
    const tradingview = getSourceEntry("tradingview-web");
    const x = getSourceEntry("x-twitter");
    expect(tradingview.enabled).toBe(false);
    expect(x.enabled).toBe(false);
    expect(tradingview.disabledReason).toMatch(/ToS/i);
    expect(x.disabledReason).toMatch(/ToS/i);
  });

  it("throws for an unknown sourceId", () => {
    expect(() => getSourceEntry("does-not-exist")).toThrow(/Unknown sourceId/);
  });

  it("every enabled source has a positive minRequestIntervalMs (politeness enforced)", () => {
    for (const entry of listEnabledSources()) {
      expect(entry.minRequestIntervalMs).toBeGreaterThan(0);
    }
  });
});

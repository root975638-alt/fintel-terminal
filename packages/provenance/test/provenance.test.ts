import { describe, expect, it } from "vitest";
import {
  worstQuality,
  deriveProvenance,
  inferQualityFromAge,
  assertSourceEnabled,
  type ProvenanceRecord,
  type SourceRegistryEntry,
} from "../src/index.js";

function mkProv(quality: ProvenanceRecord["quality"]): ProvenanceRecord {
  return {
    source: { sourceId: "test", displayName: "Test", method: "public-api", url: "", license: "" },
    fetchedAtMs: 1000,
    asOfMs: 1000,
    quality,
  };
}

describe("worstQuality", () => {
  it("returns unknown for an empty list", () => {
    expect(worstQuality([])).toBe("unknown");
  });

  it("returns the single quality when given one input", () => {
    expect(worstQuality(["realtime"])).toBe("realtime");
  });

  it("picks the worst (highest-rank) quality among mixed inputs", () => {
    expect(worstQuality(["realtime", "delayed", "eod"])).toBe("eod");
    expect(worstQuality(["realtime", "stale"])).toBe("stale");
    expect(worstQuality(["delayed", "unknown", "realtime"])).toBe("unknown");
  });
});

describe("deriveProvenance", () => {
  it("bounds derived quality by the worst input quality", () => {
    const inputs = [mkProv("realtime"), mkProv("stale"), mkProv("delayed")];
    const derived = deriveProvenance(inputs, "test-computation@1.0.0", 2000);
    expect(derived.quality).toBe("stale");
    expect(derived.computationId).toBe("test-computation@1.0.0");
    expect(derived.inputs).toHaveLength(3);
  });
});

describe("inferQualityFromAge", () => {
  it("classifies fresh data as realtime", () => {
    expect(inferQualityFromAge(1000, 60_000)).toBe("realtime");
  });

  it("classifies moderately old data as delayed", () => {
    expect(inferQualityFromAge(120_000, 60_000)).toBe("delayed");
  });

  it("classifies very old data as stale", () => {
    expect(inferQualityFromAge(10_000_000, 60_000)).toBe("stale");
  });

  it("returns unknown for negative age (clock skew)", () => {
    expect(inferQualityFromAge(-100, 60_000)).toBe("unknown");
  });
});

describe("assertSourceEnabled", () => {
  const enabledSource: SourceRegistryEntry = {
    sourceId: "test-enabled",
    displayName: "Test Enabled",
    method: "public-api",
    url: "",
    license: "",
    enabled: true,
    robotsStatus: "allowed",
    expectedCadenceMs: 60_000,
    minRequestIntervalMs: 100,
  };

  it("does not throw for an enabled, robots-allowed source", () => {
    expect(() => assertSourceEnabled(enabledSource)).not.toThrow();
  });

  it("throws with the documented reason for a disabled source", () => {
    const disabled: SourceRegistryEntry = {
      ...enabledSource,
      enabled: false,
      disabledReason: "ToS forbids automated access",
    };
    expect(() => assertSourceEnabled(disabled)).toThrow(/ToS forbids automated access/);
  });

  it("throws for a robots-disallowed source even if enabled=true", () => {
    const disallowed: SourceRegistryEntry = { ...enabledSource, robotsStatus: "disallowed" };
    expect(() => assertSourceEnabled(disallowed)).toThrow(/disallowed/);
  });
});

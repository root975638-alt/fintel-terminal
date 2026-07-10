import { describe, expect, it, vi, afterEach } from "vitest";
import { PoliteFetcher } from "../src/politeFetcher.js";
import type { SourceRegistryEntry } from "@fintel/provenance";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const source: SourceRegistryEntry = {
  sourceId: "test-slow-cadence-source",
  displayName: "Test",
  method: "rss-atom",
  url: "https://example.invalid/feed",
  license: "test",
  enabled: true,
  robotsStatus: "not-applicable",
  expectedCadenceMs: 300_000,
  minRequestIntervalMs: 30_000, // a large inter-request interval, like the real rss-reuters-business entry
};

describe("PoliteFetcher — retry/rate-limit interaction regression", () => {
  let cacheDir: string;

  afterEach(() => {
    vi.unstubAllGlobals();
    if (cacheDir) rmSync(cacheDir, { recursive: true, force: true });
  });

  it("does not multiply a large minRequestIntervalMs across retry attempts on a failing source", async () => {
    // REGRESSION TEST for a real bug found during Milestone 3 e2e verification: the rate limiter was
    // being acquired on EVERY retry attempt, so a source with minRequestIntervalMs=30s took 60-90+
    // seconds to fail on a dead feed (30s compounding per retry) instead of failing in a few seconds.
    cacheDir = mkdtempSync(join(tmpdir(), "fintel-politefetcher-test-"));
    let fetchCallCount = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        fetchCallCount++;
        throw new TypeError("fetch failed (simulated network failure)");
      }),
    );

    const fetcher = new PoliteFetcher({
      userAgent: "test-agent",
      timeoutMs: 2000,
      cacheDir,
      defaultCacheTtlMs: 60_000,
      maxRetries: 2, // 3 total attempts
    });

    const start = Date.now();
    await expect(fetcher.fetchText("https://example.invalid/feed", source)).rejects.toThrow();
    const elapsedMs = Date.now() - start;

    // With the bug, this would take >= 60,000ms (2 retries * 30,000ms rate-limit wait). Fixed, it
    // should complete in well under 5 seconds (bounded only by exponential retry backoff: ~500-2250ms).
    expect(elapsedMs).toBeLessThan(5000);
    expect(fetchCallCount).toBe(3); // initial attempt + 2 retries
  }, 10_000);
});

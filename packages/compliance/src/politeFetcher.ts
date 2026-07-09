/**
 * PoliteFetcher — the single choke point through which ALL outbound HTTP requests
 * to external data sources MUST flow. It enforces, in order:
 *   1. The source is enabled in the Source Registry (assertSourceEnabled)
 *   2. robots.txt permits the path (when robotsStatus requires a check)
 *   3. The per-source rate limiter's minimum interval has elapsed
 *   4. The circuit breaker for this source is not open
 * ...then fetches with a timeout, retries with exponential backoff + jitter on
 * transient failures, and serves/updates a local disk cache so repeated CLI runs
 * don't re-hit the network unnecessarily (also reduces load on free sources, which
 * is itself part of being a polite client).
 *
 * No adapter (Yahoo/Stooq/RSS/FRED/SEC/Binance/NSE/BSE) may use `fetch` directly —
 * all must go through PoliteFetcher.fetchText/fetchJson.
 */
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { SourceRegistryEntry } from "@fintel/provenance";
import { assertSourceEnabled } from "@fintel/provenance";
import { parseRobotsTxt, isPathAllowed, type ParsedRobots } from "./robots.js";
import { RateLimiter } from "./rateLimiter.js";
import { CircuitBreaker } from "./circuitBreaker.js";

export interface PoliteFetcherOptions {
  readonly userAgent: string;
  readonly timeoutMs: number;
  readonly cacheDir: string;
  readonly defaultCacheTtlMs: number;
  readonly maxRetries?: number;
}

interface CacheEnvelope {
  readonly fetchedAtMs: number;
  readonly url: string;
  readonly body: string;
  readonly contentType: string | null;
}

export class SourceDisallowedError extends Error {}
export class CircuitOpenError extends Error {}

export class PoliteFetcher {
  private readonly rateLimiter = new RateLimiter();
  private readonly breakers = new Map<string, CircuitBreaker>();
  private readonly robotsCache = new Map<string, ParsedRobots>();

  constructor(private readonly opts: PoliteFetcherOptions) {}

  private breakerFor(sourceId: string): CircuitBreaker {
    let b = this.breakers.get(sourceId);
    if (!b) {
      b = new CircuitBreaker();
      this.breakers.set(sourceId, b);
    }
    return b;
  }

  private cacheKey(url: string): string {
    return createHash("sha256").update(url).digest("hex");
  }

  private cachePath(url: string): string {
    return join(this.opts.cacheDir, `${this.cacheKey(url)}.json`);
  }

  private async readCache(url: string, ttlMs: number, clock: () => number): Promise<CacheEnvelope | undefined> {
    try {
      const raw = await readFile(this.cachePath(url), "utf-8");
      const parsed = JSON.parse(raw) as CacheEnvelope;
      if (clock() - parsed.fetchedAtMs > ttlMs) return undefined;
      return parsed;
    } catch {
      return undefined;
    }
  }

  private async writeCache(entry: CacheEnvelope): Promise<void> {
    const path = this.cachePath(entry.url);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, JSON.stringify(entry), "utf-8");
  }

  private async checkRobots(source: SourceRegistryEntry, url: URL): Promise<void> {
    if (source.robotsStatus === "not-applicable" || source.robotsStatus === "unchecked") return;
    if (source.robotsStatus === "disallowed") {
      throw new SourceDisallowedError(`Source "${source.sourceId}" is marked disallowed in the registry.`);
    }
    const robotsUrl = `${url.origin}/robots.txt`;
    let robots = this.robotsCache.get(url.origin);
    if (!robots) {
      try {
        const res = await fetch(robotsUrl, {
          headers: { "User-Agent": this.opts.userAgent },
          signal: AbortSignal.timeout(this.opts.timeoutMs),
        });
        const text = res.ok ? await res.text() : "";
        robots = parseRobotsTxt(text);
      } catch {
        robots = parseRobotsTxt(""); // fail open only for the ROBOTS FETCH itself; the registry entry already vetted the source
      }
      this.robotsCache.set(url.origin, robots);
    }
    if (!isPathAllowed(robots, this.opts.userAgent, url.pathname)) {
      throw new SourceDisallowedError(
        `robots.txt at ${robotsUrl} disallows path "${url.pathname}" for User-Agent "${this.opts.userAgent}".`,
      );
    }
  }

  private async fetchWithRetry(
    url: string,
    source: SourceRegistryEntry,
    clock: () => number,
  ): Promise<{ body: string; contentType: string | null }> {
    const maxRetries = this.opts.maxRetries ?? 3;
    let lastError: unknown;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        await this.rateLimiter.acquire(source.sourceId, clock);
        const res = await fetch(url, {
          headers: { "User-Agent": this.opts.userAgent, Accept: "*/*" },
          signal: AbortSignal.timeout(this.opts.timeoutMs),
        });
        if (res.status === 429 || res.status >= 500) {
          throw new Error(`HTTP ${res.status} from ${url}`);
        }
        if (!res.ok) {
          // 4xx other than 429 is not retryable — likely a bad request/URL, not transient.
          throw Object.assign(new Error(`HTTP ${res.status} from ${url}`), { nonRetryable: true });
        }
        const body = await res.text();
        return { body, contentType: res.headers.get("content-type") };
      } catch (err) {
        lastError = err;
        if ((err as { nonRetryable?: boolean }).nonRetryable) break;
        if (attempt < maxRetries) {
          const backoffMs = Math.min(30_000, 500 * 2 ** attempt) + Math.random() * 250;
          await new Promise((resolve) => setTimeout(resolve, backoffMs));
        }
      }
    }
    throw lastError instanceof Error ? lastError : new Error(String(lastError));
  }

  /**
   * Fetch a URL as text, honoring source-registry gating, robots.txt, rate limits,
   * circuit breaking, retries, and disk caching. `cacheTtlMs` overrides the default.
   */
  async fetchText(
    url: string,
    source: SourceRegistryEntry,
    opts: { cacheTtlMs?: number; clock?: () => number } = {},
  ): Promise<{ body: string; fromCache: boolean; fetchedAtMs: number }> {
    assertSourceEnabled(source);
    const clock = opts.clock ?? Date.now;
    const ttl = opts.cacheTtlMs ?? this.opts.defaultCacheTtlMs;

    const cached = await this.readCache(url, ttl, clock);
    if (cached) {
      return { body: cached.body, fromCache: true, fetchedAtMs: cached.fetchedAtMs };
    }

    const breaker = this.breakerFor(source.sourceId);
    if (!breaker.canAttempt(clock)) {
      throw new CircuitOpenError(
        `Circuit open for source "${source.sourceId}" — too many recent failures; refusing to hammer it.`,
      );
    }

    this.rateLimiter.configure(source.sourceId, source.minRequestIntervalMs);
    const parsedUrl = new URL(url);
    await this.checkRobots(source, parsedUrl);

    try {
      const { body } = await this.fetchWithRetry(url, source, clock);
      breaker.recordSuccess();
      const fetchedAtMs = clock();
      await this.writeCache({ url, body, contentType: null, fetchedAtMs });
      return { body, fromCache: false, fetchedAtMs };
    } catch (err) {
      breaker.recordFailure(clock);
      // Fall back to a stale cache entry if one exists, rather than failing outright —
      // this fallback is EXPLICIT (returned fromCache=true with a stale flag would be
      // added by the caller's provenance tagging as "stale"), never silent.
      const stale = await this.readCache(url, Number.POSITIVE_INFINITY, clock);
      if (stale) {
        return { body: stale.body, fromCache: true, fetchedAtMs: stale.fetchedAtMs };
      }
      throw err;
    }
  }

  async fetchJson<T>(
    url: string,
    source: SourceRegistryEntry,
    opts: { cacheTtlMs?: number; clock?: () => number } = {},
  ): Promise<{ data: T; fromCache: boolean; fetchedAtMs: number }> {
    const { body, fromCache, fetchedAtMs } = await this.fetchText(url, source, opts);
    return { data: JSON.parse(body) as T, fromCache, fetchedAtMs };
  }
}

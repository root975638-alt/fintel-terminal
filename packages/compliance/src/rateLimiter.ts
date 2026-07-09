/**
 * Per-source rate limiter enforcing a minimum interval between requests
 * (politeness), independent of any Crawl-delay directive discovered in robots.txt
 * (the effective delay is the max of configured minRequestIntervalMs and any
 * crawl-delay this module is told about).
 */

interface RateLimiterState {
  lastRequestAtMs: number;
  minIntervalMs: number;
}

export class RateLimiter {
  private readonly state = new Map<string, RateLimiterState>();

  configure(sourceId: string, minIntervalMs: number): void {
    const existing = this.state.get(sourceId);
    this.state.set(sourceId, { lastRequestAtMs: existing?.lastRequestAtMs ?? 0, minIntervalMs });
  }

  /** Resolves once it is polite to issue the next request for sourceId, then records the request time. */
  async acquire(sourceId: string, clock: () => number = Date.now): Promise<void> {
    const s = this.state.get(sourceId) ?? { lastRequestAtMs: 0, minIntervalMs: 1000 };
    const now = clock();
    const earliestNext = s.lastRequestAtMs + s.minIntervalMs;
    if (earliestNext > now) {
      await new Promise((resolve) => setTimeout(resolve, earliestNext - now));
    }
    s.lastRequestAtMs = clock();
    this.state.set(sourceId, s);
  }
}

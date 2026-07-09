import { describe, expect, it } from "vitest";
import { parseRobotsTxt, isPathAllowed, crawlDelaySeconds } from "../src/robots.js";
import { CircuitBreaker } from "../src/circuitBreaker.js";
import { RateLimiter } from "../src/rateLimiter.js";

describe("parseRobotsTxt / isPathAllowed", () => {
  const sampleRobots = `
User-agent: *
Disallow: /private/
Allow: /private/public-page.html
Crawl-delay: 2

User-agent: BadBot
Disallow: /
`;

  it("disallows a path matched by a Disallow rule for the wildcard group", () => {
    const robots = parseRobotsTxt(sampleRobots);
    expect(isPathAllowed(robots, "fintel-terminal/0.1", "/private/secret.html")).toBe(false);
  });

  it("allows a path matched by a more specific Allow rule (longest-match-wins)", () => {
    const robots = parseRobotsTxt(sampleRobots);
    expect(isPathAllowed(robots, "fintel-terminal/0.1", "/private/public-page.html")).toBe(true);
  });

  it("allows paths not matched by any rule", () => {
    const robots = parseRobotsTxt(sampleRobots);
    expect(isPathAllowed(robots, "fintel-terminal/0.1", "/public/data.json")).toBe(true);
  });

  it("blocks everything for a specifically named disallowed bot", () => {
    const robots = parseRobotsTxt(sampleRobots);
    expect(isPathAllowed(robots, "BadBot", "/anything")).toBe(false);
  });

  it("extracts crawl-delay for the applicable group", () => {
    const robots = parseRobotsTxt(sampleRobots);
    expect(crawlDelaySeconds(robots, "fintel-terminal/0.1")).toBe(2);
  });

  it("defaults to allowed when robots.txt is empty", () => {
    const robots = parseRobotsTxt("");
    expect(isPathAllowed(robots, "fintel-terminal/0.1", "/anything")).toBe(true);
  });

  it("supports wildcard patterns in Disallow rules", () => {
    const robots = parseRobotsTxt("User-agent: *\nDisallow: /api/*.json$\n");
    expect(isPathAllowed(robots, "x", "/api/data.json")).toBe(false);
    expect(isPathAllowed(robots, "x", "/api/data.xml")).toBe(true);
  });
});

describe("CircuitBreaker", () => {
  it("stays closed below the failure threshold", () => {
    const cb = new CircuitBreaker(3, 60_000);
    cb.recordFailure();
    cb.recordFailure();
    expect(cb.canAttempt()).toBe(true);
  });

  it("opens after reaching the failure threshold", () => {
    const cb = new CircuitBreaker(3, 60_000);
    cb.recordFailure();
    cb.recordFailure();
    cb.recordFailure();
    expect(cb.canAttempt()).toBe(false);
  });

  it("transitions to half-open after the open duration elapses", () => {
    let now = 1_000_000;
    const clock = () => now;
    const cb = new CircuitBreaker(1, 5_000);
    cb.recordFailure(clock);
    expect(cb.getState(clock)).toBe("open");
    now += 6_000;
    expect(cb.getState(clock)).toBe("half-open");
  });

  it("resets to closed on success", () => {
    const cb = new CircuitBreaker(2, 60_000);
    cb.recordFailure();
    cb.recordSuccess();
    cb.recordFailure();
    expect(cb.canAttempt()).toBe(true); // only 1 consecutive failure after the reset
  });
});

describe("RateLimiter", () => {
  it("computes the correct wait time and eventually resolves once the interval elapses", async () => {
    let now = 0;
    const clock = () => now;
    const limiter = new RateLimiter();
    limiter.configure("test-source", 50); // short interval to keep the test fast

    await limiter.acquire("test-source", clock); // first call: no wait
    now = 10; // advance only 10ms, less than the 50ms minimum interval

    const start = Date.now();
    await limiter.acquire("test-source", clock);
    const elapsedRealMs = Date.now() - start;
    // Real wall-clock wait should be roughly (50 - 10) = 40ms, confirming politeness is enforced.
    expect(elapsedRealMs).toBeGreaterThanOrEqual(30);
  });
});

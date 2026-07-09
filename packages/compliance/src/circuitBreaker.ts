/**
 * Circuit breaker — protects a source (and the wider system) from hammering an
 * endpoint that is failing or actively blocking us. After `failureThreshold`
 * consecutive failures, the circuit "opens" and fails fast for `openDurationMs`
 * before allowing a single "half-open" probe request through.
 */

export type CircuitState = "closed" | "open" | "half-open";

export class CircuitBreaker {
  private state: CircuitState = "closed";
  private consecutiveFailures = 0;
  private openedAtMs = 0;

  constructor(
    private readonly failureThreshold = 5,
    private readonly openDurationMs = 5 * 60_000,
  ) {}

  getState(clock: () => number = Date.now): CircuitState {
    if (this.state === "open" && clock() - this.openedAtMs >= this.openDurationMs) {
      this.state = "half-open";
    }
    return this.state;
  }

  canAttempt(clock: () => number = Date.now): boolean {
    return this.getState(clock) !== "open";
  }

  recordSuccess(): void {
    this.consecutiveFailures = 0;
    this.state = "closed";
  }

  recordFailure(clock: () => number = Date.now): void {
    this.consecutiveFailures += 1;
    if (this.consecutiveFailures >= this.failureThreshold) {
      this.state = "open";
      this.openedAtMs = clock();
    }
  }
}

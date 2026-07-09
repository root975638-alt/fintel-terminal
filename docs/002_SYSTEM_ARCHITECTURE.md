# 002 — System Architecture (Milestone 1)

## Architectural style

**Hexagonal / Ports & Adapters**, enforced by package boundaries in the pnpm
monorepo. Every service depends on interfaces (`Port`), never on concrete
implementations of another service. This lets sources, storage backends, and
strategies be swapped without touching consumers.

## Package/service graph (dependency direction: top depends on bottom)

```
clients/cli  ─────────┐
services/api-gateway ──┼──► packages/core (embeddable composition root)
                       │         │
                       │         ├──► services/signals ──► services/technical-analysis
                       │         ├──► services/market-data
                       │         │        ├──► services/data-acquisition
                       │         │        │        └──► packages/compliance
                       │         │        └──► services/persistence
                       │         └──► packages/config
                       │
                       └──► packages/types (API DTOs)

All of the above ──► packages/domain ──► packages/money-time
                                     └──► packages/provenance
```

## Why `packages/core` exists

Both the CLI and the API Gateway need the *exact same* business logic —
config loading, data acquisition, persistence, market-data orchestration, and
signal generation. `packages/core`'s `createFintelCore()` is the single
composition root both consume, so:

- The **CLI** runs fully embedded, in-process, with SQLite — zero external
  services, works offline/locally/on Termux.
- The **API Gateway** wraps the identical composition in an HTTP server for
  remote/self-hosted use.

No business logic is duplicated between the two clients.

## Data flow (this milestone)

```
1. User runs `fintel quote CRYPTO:BTCUSDT` (or hits GET /instruments/CRYPTO:BTCUSDT/bars)
2. resolveInstrument() maps the symbol to a canonical Instrument
3. MarketDataService checks SQLite for fresh-enough persisted bars
     — if stale/missing, calls the market-appropriate DataAcquisition adapter
       (Binance for CRYPTO, Stooq→Yahoo fallback for US_EQUITIES, NSE bhavcopy for NSE)
     — the adapter's PoliteFetcher enforces: source-registry check → robots.txt
       check → rate limit → circuit breaker → disk cache → HTTP fetch w/ retry+backoff
     — result is tagged with ProvenanceRecord (source, fetchedAt, asOf, quality)
4. Bars are upserted into SQLite and returned
5. (For /signals) SignalEngine runs all registered strategies against the bars
     — each strategy computes TA indicators (SMA/EMA/RSI/MACD/Bollinger/ATR)
     — confidence is bounded by the worst input data quality (deriveProvenance)
     — every signal is labeled HYPOTHESIS (no backtest validation exists yet)
6. Response is wrapped in an ApiEnvelope with meta + freshness metadata
7. CLI renders human-readable output (ANSI colors, ASCII sparkline) or --json
```

## Technology choices (Milestone 1)

| Concern | Choice | Rationale |
|---|---|---|
| Language | TypeScript (strict, `exactOptionalPropertyTypes`) | End-to-end type safety across CLI/API/services |
| Package manager | pnpm workspaces | Fast, disk-efficient, standard monorepo tool |
| Persistence | `node:sqlite` (Node ≥22.5 built-in) | Zero native compilation — works on Termux/ARM without a build toolchain, unlike `better-sqlite3` |
| HTTP framework | Fastify | Fast, TypeScript-friendly, small footprint |
| CLI framework | Commander | Zero-dependency-adjacent, well-maintained, cross-platform |
| Validation | Zod | Runtime + compile-time config validation |
| XML parsing | fast-xml-parser | Pure JS, no native deps, Termux-safe |
| Testing | Vitest (most packages), `node:test` (persistence — see below) | Fast, TS-native |

### Why persistence tests use `node:test` instead of Vitest

Vite's dependency resolver cannot yet resolve the very new `node:sqlite`
built-in (fails with "Failed to load url sqlite"), while plain Node handles it
natively. Rather than adding a native SQLite binding (which would break the
Termux/zero-native-deps goal) or fighting Vite's resolver, the persistence
package's integration tests run via Node's own built-in test runner
(`tsc -p tsconfig.test.json && node --test dist-test/test/*.js`), which needs
no bundler at all.

## Non-goals of this architecture (by design, not oversight)

- No message broker/event bus yet (in-process function calls suffice at this
  scale; `services/streaming` is a documented follow-on milestone).
- No auth/RBAC yet (single-user local/self-hosted CLI+API; not exposed
  multi-tenant).
- No Postgres/Timescale backend yet (SQLite only; the repository interfaces in
  `services/persistence/src/repositories/ports.ts` are already backend-agnostic
  so a Postgres implementation can be added later without touching callers).

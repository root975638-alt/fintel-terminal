/**
 * packages/core — the embeddable composition root. Wires config, the data
 * acquisition layer (compliant adapters), SQLite persistence, the market-data
 * orchestration service, and the signal engine into a single object graph that:
 *   - The CLI uses directly, in-process, with SQLite — zero external services,
 *     fully functional offline/local/Termux (spec Section 6.17/13/STAGE 13).
 *   - The API Gateway wraps in an HTTP server for remote/self-hosted use.
 * Both clients share EXACTLY this composition — no logic duplication between them.
 */
import { loadConfig, type AppConfig } from "@fintel/config";
import { createDataAcquisitionLayer, type DataAcquisitionLayer } from "@fintel/data-acquisition";
import type { Instrument } from "@fintel/domain";
import { MarketDataService } from "@fintel/market-data";
import { openPersistenceLayer, type PersistenceLayer } from "@fintel/persistence";
import { SignalEngine } from "@fintel/signals";
import { Timeframe } from "@fintel/money-time";

export interface FintelCore {
  readonly config: AppConfig;
  readonly acquisition: DataAcquisitionLayer;
  readonly persistence: PersistenceLayer;
  readonly marketData: MarketDataService;
  readonly signals: SignalEngine;
  close(): void;
}

export function createFintelCore(env: NodeJS.ProcessEnv = process.env): FintelCore {
  const config = loadConfig(env);
  const acquisition = createDataAcquisitionLayer(config);
  const persistence = openPersistenceLayer(config.SQLITE_PATH);
  const marketData = new MarketDataService({ acquisition, persistence });
  const signals = new SignalEngine();

  return {
    config,
    acquisition,
    persistence,
    marketData,
    signals,
    close: () => persistence.close(),
  };
}

/**
 * A small, well-known instrument catalogue covering the milestone-1 markets
 * (US equities, crypto, NSE India) so the CLI/API have something concrete to
 * demo against without requiring a full symbol-master ingestion pipeline yet
 * (that is a follow-on milestone: bulk instrument reference-data ingestion).
 */
export const SEED_INSTRUMENTS: readonly Instrument[] = [
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
  {
    instrumentId: "CRYPTO:ETHUSDT",
    market: "CRYPTO",
    symbol: "ETHUSDT",
    assetClass: "crypto",
    displayName: "Ethereum / TetherUS",
    currency: "USDT",
    active: true,
  },
  {
    instrumentId: "NSE:RELIANCE",
    market: "NSE",
    symbol: "RELIANCE",
    assetClass: "equity",
    displayName: "Reliance Industries Ltd.",
    currency: "INR",
    active: true,
  },
];

export function findSeedInstrument(instrumentId: string): Instrument | undefined {
  return SEED_INSTRUMENTS.find((i) => i.instrumentId === instrumentId);
}

export { Timeframe };
export * from "@fintel/domain";
export * from "@fintel/provenance";
export * from "./doctor.js";


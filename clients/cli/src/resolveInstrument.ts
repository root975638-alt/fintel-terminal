import { findSeedInstrument, SEED_INSTRUMENTS, type FintelCore } from "@fintel/core";
import { makeInstrumentId, type Instrument, type MarketId } from "@fintel/domain";

/**
 * Resolves a user-typed symbol (e.g. "AAPL", "CRYPTO:BTCUSDT", "btcusdt") into a
 * canonical Instrument. Falls back to the CLI's configured default market when no
 * market prefix is given, and to a synthetic Instrument (best-effort, currency
 * unknown) when the symbol isn't in the seed catalogue yet — this milestone does
 * not yet ship a full symbol-master lookup service (follow-on milestone).
 */
export async function resolveInstrument(core: FintelCore, rawSymbol: string): Promise<Instrument> {
  const upper = rawSymbol.toUpperCase();
  if (upper.includes(":")) {
    const seeded = findSeedInstrument(upper);
    if (seeded) return seeded;
    const persisted = await core.persistence.instruments.findById(upper);
    if (persisted) return persisted;
    const [market, symbol] = upper.split(":") as [MarketId, string];
    return syntheticInstrument(market, symbol);
  }

  const defaultMarket = core.config.CLI_DEFAULT_MARKET as MarketId;
  const candidateId = makeInstrumentId(defaultMarket, upper);
  const seeded = findSeedInstrument(candidateId);
  if (seeded) return seeded;
  const persisted = await core.persistence.instruments.findById(candidateId);
  if (persisted) return persisted;
  return syntheticInstrument(defaultMarket, upper);
}

function syntheticInstrument(market: MarketId, symbol: string): Instrument {
  const currency = market === "CRYPTO" ? "USDT" : market === "NSE" || market === "BSE" ? "INR" : "USD";
  return {
    instrumentId: makeInstrumentId(market, symbol),
    market,
    symbol,
    assetClass: market === "CRYPTO" ? "crypto" : "equity",
    displayName: symbol,
    currency,
    active: true,
  };
}

export function listKnownSymbolsHelp(): string {
  return SEED_INSTRUMENTS.map((i) => `${i.instrumentId} (${i.displayName})`).join("\n  ");
}

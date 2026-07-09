/**
 * Core domain entities shared across all services, the API, and the CLI.
 * This is the single source of truth for what a "Bar", "Signal", etc. means.
 */
import type { EpochMillis } from "@fintel/money-time";
import type { ProvenanceRecord, DerivedProvenance } from "@fintel/provenance";

export type AssetClass = "equity" | "crypto" | "forex" | "index" | "etf" | "future" | "option";

export type MarketId = "US_EQUITIES" | "NSE" | "BSE" | "CRYPTO" | "FOREX";

/** A tradable instrument, identified uniquely by (market, symbol). */
export interface Instrument {
  readonly instrumentId: string; // canonical id: `${market}:${symbol}`, e.g. "US_EQUITIES:AAPL"
  readonly market: MarketId;
  readonly symbol: string;
  readonly assetClass: AssetClass;
  readonly displayName: string;
  readonly currency: string; // ISO 4217 or asset symbol (e.g. "USD", "INR", "BTC")
  readonly exchangeMic?: string | undefined; // ISO 10383 Market Identifier Code, when known
  readonly isin?: string | undefined;
  readonly active: boolean;
}

export function makeInstrumentId(market: MarketId, symbol: string): string {
  return `${market}:${symbol.toUpperCase()}`;
}

/** A single OHLCV bar for a fixed timeframe bucket. Prices as decimal strings (Money-compatible), never floats. */
export interface Bar {
  readonly instrumentId: string;
  readonly timeframe: string; // Timeframe enum value from @fintel/money-time
  readonly bucketStartMs: EpochMillis;
  readonly open: string;
  readonly high: string;
  readonly low: string;
  readonly close: string;
  readonly volume: string;
  /** true if open/high/low/close have been adjusted for splits/dividends; false = raw as-traded prices. */
  readonly adjusted: boolean;
  readonly provenance: ProvenanceRecord;
}

/** A real-time or last-known quote (bid/ask/last), not necessarily bar-aligned. */
export interface Quote {
  readonly instrumentId: string;
  readonly tsMs: EpochMillis;
  readonly last?: string | undefined;
  readonly bid?: string | undefined;
  readonly ask?: string | undefined;
  readonly bidSize?: string | undefined;
  readonly askSize?: string | undefined;
  readonly dayOpen?: string | undefined;
  readonly dayHigh?: string | undefined;
  readonly dayLow?: string | undefined;
  readonly previousClose?: string | undefined;
  readonly volume?: string | undefined;
  readonly provenance: ProvenanceRecord;
}

/** A single trade print (tick). */
export interface Tick {
  readonly instrumentId: string;
  readonly tsMs: EpochMillis;
  readonly price: string;
  readonly size: string;
  readonly provenance: ProvenanceRecord;
}

export type NewsSentiment = "very-negative" | "negative" | "neutral" | "positive" | "very-positive";

export interface NewsItem {
  readonly newsId: string; // stable hash of source+url+title, for dedup
  readonly headline: string;
  readonly summary?: string | undefined;
  readonly url: string;
  readonly publishedAtMs: EpochMillis;
  readonly sourceName: string;
  /** Instrument ids this item was matched/entity-linked to, may be empty if unmatched. */
  readonly relatedInstrumentIds: readonly string[];
  readonly sentiment?: NewsSentiment | undefined;
  /** Sentiment score in [-1, 1], only present once the news-intelligence pipeline scores it. [EXPERIMENTAL] */
  readonly sentimentScore?: number | undefined;
  readonly provenance: ProvenanceRecord;
}

export interface MacroEvent {
  readonly eventId: string;
  readonly name: string; // e.g. "US Non-Farm Payrolls"
  readonly countryOrRegion: string;
  readonly scheduledAtMs: EpochMillis;
  readonly actualValue?: number;
  readonly consensusValue?: number;
  readonly previousValue?: number;
  readonly unit?: string;
  readonly provenance: ProvenanceRecord;
}

export type SignalDirection = "long" | "short" | "flat";

/** A signal is ALWAYS advisory analytics output, never an order. Confidence is bounded by input data quality
 * (spec 6.8) — the signal engine MUST NOT report a confidence above what deriveProvenance's worst-quality
 * computation supports. */
export interface Signal {
  readonly signalId: string;
  readonly instrumentId: string;
  readonly strategyId: string; // versioned identifier of the strategy/rule that produced this
  readonly direction: SignalDirection;
  /** Normalized strength/score in [-1, 1] (negative = bearish conviction, positive = bullish). */
  readonly score: number;
  /** Calibrated confidence in [0, 1]. MUST NOT exceed the worst input quality's implied ceiling. */
  readonly confidence: number;
  /** Expected value estimate (informational only) — MUST include the assumptions used (costs, sample size) in rationale. */
  readonly expectedValue?: number | undefined;
  readonly rationale: string;
  readonly honestyLabel: "ESTABLISHED" | "EXPERIMENTAL" | "HYPOTHESIS" | "SPECULATIVE";
  readonly generatedAtMs: EpochMillis;
  readonly provenance: DerivedProvenance;
}

export interface Portfolio {
  readonly portfolioId: string;
  readonly baseCurrency: string;
  readonly positions: readonly Position[];
  readonly cashBalance: string;
}

export interface Position {
  readonly instrumentId: string;
  readonly quantity: string;
  readonly avgCostBasis: string; // per-unit, in portfolio base currency
  readonly openedAtMs: EpochMillis;
}

export interface Transaction {
  readonly transactionId: string;
  readonly portfolioId: string;
  readonly instrumentId: string;
  readonly side: "buy" | "sell";
  readonly quantity: string;
  readonly price: string;
  readonly feesAndCommissions: string;
  readonly executedAtMs: EpochMillis;
}

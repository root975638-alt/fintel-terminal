/**
 * DataSourcePort — the single interface every acquisition adapter implements.
 * Higher-level services (market-data, news, macro) depend only on this port,
 * never on a concrete adapter, so sources can be swapped/added without touching
 * consuming code (Hexagonal/Ports & Adapters, spec Section 4).
 */
import type { Bar, NewsItem, Quote } from "@fintel/domain";
import type { Timeframe } from "@fintel/money-time";

export interface BarQuery {
  readonly instrumentId: string;
  readonly symbol: string; // source-native symbol, resolved by the caller
  readonly timeframe: Timeframe;
  readonly fromMs?: number | undefined;
  readonly toMs?: number | undefined;
}

export interface QuoteQuery {
  readonly instrumentId: string;
  readonly symbol: string;
}

export interface NewsQuery {
  readonly query?: string; // free-text search term, when the source supports it
  readonly relatedInstrumentIds?: readonly string[];
}

export interface MarketDataSourcePort {
  readonly sourceId: string;
  fetchBars(query: BarQuery): Promise<readonly Bar[]>;
  fetchQuote(query: QuoteQuery): Promise<Quote>;
}

export interface NewsSourcePort {
  readonly sourceId: string;
  fetchNews(query: NewsQuery): Promise<readonly NewsItem[]>;
}

export interface MacroObservation {
  readonly seriesId: string;
  readonly dateMs: number;
  readonly value: number | null; // null = missing observation (source reports "." or similar)
}

export interface MacroSourcePort {
  readonly sourceId: string;
  fetchSeries(seriesId: string, fromMs?: number, toMs?: number): Promise<readonly MacroObservation[]>;
}

/**
 * Macro service — wires the FRED adapter into a fetch-and-persist pipeline
 * plus the regime-tagging heuristics. Explicit degraded mode when FRED_API_KEY
 * is missing: throws a clear, actionable error rather than silently returning
 * fabricated/empty data.
 */
import type { FredAdapter } from "@fintel/data-acquisition";
import type { PersistenceLayer } from "@fintel/persistence";
import { MACRO_SERIES_CATALOGUE, getSeriesDescriptor, type MacroSeriesDescriptor } from "./seriesCatalogue.js";
import { classifyRateRegime, classifyInflationRegime, classifyTrend, type RateRegime, type InflationRegime } from "./regime.js";

export interface MacroSnapshot {
  readonly rateRegime: RateRegime;
  readonly inflationRegime: InflationRegime;
  readonly fetchedAtMs: number;
  readonly seriesFetched: readonly string[];
  readonly disclaimer: string;
}

const MACRO_DISCLAIMER =
  "Regime tags are simple trend heuristics over a single series each ([EXPERIMENTAL], not an economic model). " +
  "Real regime identification requires synthesizing many indicators with expert judgment; treat these tags as " +
  "one narrow, mechanical signal, never a standalone macro call.";

export class MacroService {
  constructor(
    private readonly fred: FredAdapter,
    private readonly persistence: PersistenceLayer,
  ) {}

  listSeriesCatalogue(): readonly MacroSeriesDescriptor[] {
    return MACRO_SERIES_CATALOGUE;
  }

  /** Fetches and persists a single series, returning its full stored history. */
  async fetchSeries(seriesId: string, fromMs?: number, toMs?: number) {
    const descriptor = getSeriesDescriptor(seriesId);
    if (!descriptor) {
      throw new Error(
        `Series "${seriesId}" is not in the curated macro catalogue. Known series: ` +
          `${MACRO_SERIES_CATALOGUE.map((s) => s.seriesId).join(", ")}.`,
      );
    }
    const observations = await this.fred.fetchSeries(seriesId, fromMs, toMs);
    const fetchedAtMs = Date.now();
    await this.persistence.macroObservations.upsertMany(
      observations.map((o) => ({ ...o, fetchedAtMs, sourceId: this.fred.sourceId })),
    );
    return observations;
  }

  /** Fetches Fed Funds + CPI (the two series regime tagging depends on) and computes a MacroSnapshot. */
  async computeSnapshot(): Promise<MacroSnapshot> {
    const fedFunds = await this.fetchSeries("FEDFUNDS");
    const cpi = await this.fetchSeries("CPIAUCSL");

    return {
      rateRegime: classifyRateRegime(fedFunds),
      inflationRegime: classifyInflationRegime(cpi),
      fetchedAtMs: Date.now(),
      seriesFetched: ["FEDFUNDS", "CPIAUCSL"],
      disclaimer: MACRO_DISCLAIMER,
    };
  }
}

export * from "./seriesCatalogue.js";
export * from "./regime.js";
export { classifyTrend };

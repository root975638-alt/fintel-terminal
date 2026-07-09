/**
 * FRED (Federal Reserve Economic Data) adapter — official free public API from the
 * St. Louis Fed. Requires a free registration API key (FRED_API_KEY config value);
 * this is NOT a paid commercial API, just free self-service key registration to
 * prevent abuse, consistent with the platform's "no paid APIs" policy.
 */
import { PoliteFetcher } from "@fintel/compliance";
import { getSourceEntry } from "@fintel/config";
import { epochMillis, fromIso } from "@fintel/money-time";
import type { MacroObservation, MacroSourcePort } from "../ports.js";

const SOURCE_ID = "fred-api";

interface FredObservationsResponse {
  observations: Array<{ date: string; value: string }>;
}

export class FredAdapter implements MacroSourcePort {
  readonly sourceId = SOURCE_ID;

  constructor(
    private readonly fetcher: PoliteFetcher,
    private readonly apiKey: string | undefined,
  ) {}

  async fetchSeries(seriesId: string, fromMs?: number, toMs?: number): Promise<readonly MacroObservation[]> {
    if (!this.apiKey) {
      throw new Error(
        "FRED_API_KEY is not configured. Register a free key at https://fred.stlouisfed.org/docs/api/api_key.html " +
          "and set FRED_API_KEY in your environment — this is free self-service registration, not a paid API.",
      );
    }
    const source = getSourceEntry(SOURCE_ID);
    const params = new URLSearchParams({
      series_id: seriesId,
      api_key: this.apiKey,
      file_type: "json",
    });
    if (fromMs !== undefined) params.set("observation_start", new Date(fromMs).toISOString().slice(0, 10));
    if (toMs !== undefined) params.set("observation_end", new Date(toMs).toISOString().slice(0, 10));

    const url = `https://api.stlouisfed.org/fred/series/observations?${params.toString()}`;
    const { data } = await this.fetcher.fetchJson<FredObservationsResponse>(url, source, {
      cacheTtlMs: 6 * 60 * 60_000,
    });

    return data.observations.map((obs) => ({
      seriesId,
      dateMs: epochMillis(fromIso(`${obs.date}T00:00:00Z`)),
      value: obs.value === "." ? null : Number(obs.value),
    }));
  }
}

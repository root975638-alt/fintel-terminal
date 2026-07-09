/**
 * SEC EDGAR adapter — official free company-facts XBRL JSON API. SEC's own
 * developer documentation requires a descriptive User-Agent identifying the
 * requester (enforced via the shared HTTP_USER_AGENT config, not a per-adapter
 * hack), which the PoliteFetcher already sends on every request.
 */
import { PoliteFetcher } from "@fintel/compliance";
import { getSourceEntry } from "@fintel/config";

const SOURCE_ID = "sec-edgar-api";

export interface SecFactUnit {
  readonly end: string;
  readonly val: number;
  readonly fy: number;
  readonly fp: string;
  readonly form: string;
  readonly filed: string;
}

export interface SecCompanyFacts {
  readonly cik: number;
  readonly entityName: string;
  readonly facts: {
    readonly "us-gaap"?: Record<string, { units: Record<string, SecFactUnit[]> }>;
  };
}

export class SecEdgarAdapter {
  readonly sourceId = SOURCE_ID;

  constructor(private readonly fetcher: PoliteFetcher) {}

  /** cik must be zero-padded to 10 digits, e.g. "0000320193" for Apple. */
  async fetchCompanyFacts(cik: string): Promise<SecCompanyFacts> {
    const source = getSourceEntry(SOURCE_ID);
    const paddedCik = cik.padStart(10, "0");
    const url = `https://data.sec.gov/api/xbrl/companyfacts/CIK${paddedCik}.json`;
    const { data } = await this.fetcher.fetchJson<SecCompanyFacts>(url, source, {
      cacheTtlMs: 24 * 60 * 60_000,
    });
    return data;
  }

  /** Extracts a single us-gaap concept's reported values (e.g. "Assets", "NetIncomeLoss") across filings. */
  extractConcept(facts: SecCompanyFacts, concept: string, unit = "USD"): readonly SecFactUnit[] {
    return facts.facts["us-gaap"]?.[concept]?.units[unit] ?? [];
  }
}

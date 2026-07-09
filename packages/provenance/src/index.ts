/**
 * Provenance & data-quality primitives.
 *
 * NON-NEGOTIABLE RULE (master spec Section 0/8): every datum flowing through the
 * platform carries WHERE it came from, HOW it was obtained, WHEN it was fetched,
 * and HOW FRESH/reliable it is. Nothing may be presented as real-time/authoritative
 * unless it demonstrably is. This module is imported by every service that emits
 * data to storage, the event bus, the API, the CLI, or the (future) web UI.
 */

/** How a piece of data was acquired. Mirrors the DataSourcePort adapter kinds. */
export type AcquisitionMethod =
  | "public-api"       // official free API (FRED, SEC EDGAR, exchange public REST)
  | "public-json-endpoint" // unofficial-but-public JSON endpoint (e.g. Yahoo chart API)
  | "csv-download"     // free CSV/flat-file download (e.g. Stooq, NSE/BSE bhavcopy)
  | "rss-atom"         // syndicated RSS/Atom feed
  | "open-dataset"     // static open/public dataset with a license
  | "mcp-tool";        // fetched via an MCP tool/server

/** Freshness/quality classification — MUST be surfaced in UI/CLI/API, never hidden. */
export type QualityTag =
  | "realtime"     // sub-second to few-second latency, source explicitly supports this
  | "delayed"      // known fixed delay (e.g. 15-minute delayed quotes)
  | "eod"          // end-of-day / daily close data only
  | "stale"        // older than the source's expected cadence; served from cache past freshness window
  | "estimated"    // derived/interpolated/model-estimated rather than observed directly
  | "unknown";     // freshness could not be determined — MUST NOT be silently treated as realtime

export interface SourceDescriptor {
  /** Stable identifier matching an entry in the Source Registry (e.g. "yahoo-chart-api"). */
  readonly sourceId: string;
  /** Human-readable name, e.g. "Yahoo Finance (public chart API)". */
  readonly displayName: string;
  readonly method: AcquisitionMethod;
  /** Canonical URL or endpoint template this record was fetched from. */
  readonly url: string;
  /** SPDX-ish license or terms summary, e.g. "public-free-no-key", "CC-BY-4.0", "ToS: personal/research use". */
  readonly license: string;
}

export interface ProvenanceRecord {
  readonly source: SourceDescriptor;
  /** Epoch millis when this specific record was fetched from the source. */
  readonly fetchedAtMs: number;
  /** Epoch millis the source claims/implies the data is "as of" (may differ from fetchedAtMs for delayed/EOD data). */
  readonly asOfMs: number;
  readonly quality: QualityTag;
  /** Optional free-text explaining WHY a quality/degradation decision was made (e.g. "source rate-limited, served from 6h cache"). */
  readonly note?: string | undefined;
}

/** Wraps any value together with its provenance so it can never be separated accidentally. */
export interface WithProvenance<T> {
  readonly value: T;
  readonly provenance: ProvenanceRecord;
}

export function withProvenance<T>(value: T, provenance: ProvenanceRecord): WithProvenance<T> {
  return { value, provenance };
}

/** Compute quality automatically from age vs. an expected cadence, when the source doesn't state it explicitly. */
export function inferQualityFromAge(ageMs: number, expectedCadenceMs: number): QualityTag {
  if (ageMs < 0) return "unknown";
  if (ageMs <= expectedCadenceMs) return "realtime";
  if (ageMs <= expectedCadenceMs * 5) return "delayed";
  return "stale";
}

/**
 * Merge multiple upstream provenance records into one representing a derived value
 * (e.g. a Signal computed from TA + News + Macro features). The derived record's
 * quality is bounded by the WEAKEST input — confidence must never exceed what the
 * least-fresh/least-reliable input supports (spec Section 6.8).
 */
const QUALITY_RANK: Record<QualityTag, number> = {
  realtime: 0,
  delayed: 1,
  eod: 2,
  estimated: 3,
  stale: 4,
  unknown: 5,
};

export function worstQuality(tags: readonly QualityTag[]): QualityTag {
  if (tags.length === 0) return "unknown";
  return tags.reduce((worst, t) => (QUALITY_RANK[t] > QUALITY_RANK[worst] ? t : worst));
}

export interface DerivedProvenance {
  readonly inputs: readonly ProvenanceRecord[];
  readonly derivedAtMs: number;
  readonly quality: QualityTag;
  readonly computationId: string; // versioned identifier of the algorithm that produced the derived value
}

export function deriveProvenance(
  inputs: readonly ProvenanceRecord[],
  computationId: string,
  derivedAtMs: number,
): DerivedProvenance {
  return {
    inputs,
    derivedAtMs,
    quality: worstQuality(inputs.map((p) => p.quality)),
    computationId,
  };
}

/**
 * A Source Registry entry — the compile-time+runtime-checked catalogue of every
 * external source the platform is permitted to reach. Adapters MUST look themselves
 * up here and refuse to fetch if `enabled` is false; this is the enforcement point
 * for the ToS/robots compliance mandate (spec Section 0, 004b_SCRAPING_COMPLIANCE.md).
 */
export interface SourceRegistryEntry extends SourceDescriptor {
  readonly enabled: boolean;
  /** Required when enabled=false: WHY this source is disabled (e.g. "ToS forbids automated access"). */
  readonly disabledReason?: string;
  readonly robotsStatus: "allowed" | "disallowed" | "not-applicable" | "unchecked";
  /** Expected update cadence in milliseconds, used for staleness/quality inference. */
  readonly expectedCadenceMs: number;
  /** Minimum delay between requests to this source, in milliseconds (politeness). */
  readonly minRequestIntervalMs: number;
}

export function assertSourceEnabled(entry: SourceRegistryEntry): void {
  if (!entry.enabled) {
    throw new Error(
      `Source "${entry.sourceId}" is disabled and must not be fetched. Reason: ${
        entry.disabledReason ?? "no reason recorded (this is itself a bug — every disabled source must document why)"
      }`,
    );
  }
  if (entry.robotsStatus === "disallowed") {
    throw new Error(`Source "${entry.sourceId}" is marked robots.txt-disallowed and must not be fetched.`);
  }
}

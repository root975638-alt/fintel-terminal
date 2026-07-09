/**
 * Shared API/CLI DTOs — the single source of truth for the wire format returned by
 * the REST API and consumed by the CLI (and later the web app + generated SDK).
 * Every response envelope MUST carry provenance + freshness metadata (spec 6.20).
 */
import type { Bar, Instrument, Quote, Signal } from "@fintel/domain";
import type { QualityTag } from "@fintel/provenance";

export interface ApiMeta {
  readonly requestId: string;
  readonly generatedAtMs: number;
  readonly apiVersion: string;
}

export interface FreshnessSummary {
  readonly quality: QualityTag;
  readonly asOfMs: number;
  readonly sourceIds: readonly string[];
}

export interface ApiEnvelope<T> {
  readonly meta: ApiMeta;
  readonly freshness: FreshnessSummary;
  readonly data: T;
}

export type InstrumentResponse = ApiEnvelope<Instrument>;
export type InstrumentListResponse = ApiEnvelope<readonly Instrument[]>;
export type BarsResponse = ApiEnvelope<readonly Bar[]>;
export type QuoteResponse = ApiEnvelope<Quote>;
export type SignalsResponse = ApiEnvelope<readonly Signal[]>;

export interface ApiErrorBody {
  readonly meta: ApiMeta;
  readonly error: {
    readonly code: string;
    readonly message: string;
    readonly details?: unknown;
  };
}

export interface DoctorCheckResult {
  readonly name: string;
  readonly status: "ok" | "warn" | "fail";
  readonly message: string;
}

export interface DoctorReport {
  readonly generatedAtMs: number;
  readonly checks: readonly DoctorCheckResult[];
  readonly overall: "ok" | "warn" | "fail";
}

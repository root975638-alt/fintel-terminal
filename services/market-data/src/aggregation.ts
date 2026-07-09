/**
 * Timeframe aggregation — upsamples finer-granularity bars into a coarser
 * timeframe (e.g. M1 -> D1). Bars must already be sorted ascending by
 * bucketStartMs and belong to the same instrument/adjusted-flag.
 */
import type { Bar } from "@fintel/domain";
import { bucketStart, type Timeframe } from "@fintel/money-time";
import type { ProvenanceRecord } from "@fintel/provenance";
import { deriveProvenance, worstQuality } from "@fintel/provenance";

function addDecimalStrings(values: readonly string[]): string {
  // Volume aggregation only needs integer-safe summation; prices never get summed.
  let total = 0n;
  for (const v of values) {
    // Truncate any fractional part defensively; volumes are whole units for our sources.
    const [whole] = v.split(".");
    total += BigInt(whole || "0");
  }
  return total.toString();
}

export function aggregateBars(bars: readonly Bar[], targetTimeframe: Timeframe): Bar[] {
  if (bars.length === 0) return [];
  const buckets = new Map<number, Bar[]>();
  for (const bar of bars) {
    const key = bucketStart(bar.bucketStartMs, targetTimeframe);
    const arr = buckets.get(key) ?? [];
    arr.push(bar);
    buckets.set(key, arr);
  }

  const result: Bar[] = [];
  for (const [bucketStartMs, group] of [...buckets.entries()].sort((a, b) => a[0] - b[0])) {
    const sorted = [...group].sort((a, b) => a.bucketStartMs - b.bucketStartMs);
    const first = sorted[0]!;
    const last = sorted[sorted.length - 1]!;
    const high = sorted.reduce((max, b) => (Number(b.high) > Number(max) ? b.high : max), first.high);
    const low = sorted.reduce((min, b) => (Number(b.low) < Number(min) ? b.low : min), first.low);
    const volume = addDecimalStrings(sorted.map((b) => b.volume));

    const derivedProv = deriveProvenance(
      sorted.map((b) => b.provenance),
      `aggregate:${targetTimeframe}`,
      Date.now(),
    );
    const provenance: ProvenanceRecord = {
      source: first.provenance.source,
      fetchedAtMs: Math.max(...sorted.map((b) => b.provenance.fetchedAtMs)),
      asOfMs: last.provenance.asOfMs,
      quality: worstQuality(sorted.map((b) => b.provenance.quality)),
      note: `Aggregated from ${sorted.length} ${first.timeframe} bars`,
    };
    void derivedProv; // kept for future: attach full multi-source derivation record on Bar if schema extends

    result.push({
      instrumentId: first.instrumentId,
      timeframe: targetTimeframe,
      bucketStartMs: bucketStartMs as Bar["bucketStartMs"],
      open: first.open,
      high,
      low,
      close: last.close,
      volume,
      adjusted: sorted.every((b) => b.adjusted),
      provenance,
    });
  }
  return result;
}

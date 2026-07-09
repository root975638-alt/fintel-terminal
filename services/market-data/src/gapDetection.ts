/**
 * Gap detection — compares the actual set of bar buckets present against the
 * set expected from a session calendar, so real data outages can be told apart
 * from expected non-trading periods (weekends/holidays/off-session).
 */
import type { Bar } from "@fintel/domain";
import { AGGREGATION_ORDER, bucketStart, timeframeMs, type EpochMillis, type SessionCalendar, type Timeframe } from "@fintel/money-time";

export interface DataGap {
  readonly fromMs: number;
  readonly toMs: number;
  readonly missingBucketCount: number;
}

/**
 * Walks expected buckets between the first and last observed bar (inclusive) for
 * timeframes with a fixed duration, flags any bucket that both (a) has no bar and
 * (b) the session calendar says should have been open, as a gap.
 */
export function detectGaps(
  bars: readonly Bar[],
  timeframe: Timeframe,
  calendar: SessionCalendar,
  holidayDatesUtc?: ReadonlySet<string>,
): DataGap[] {
  if (bars.length < 2) return [];
  if (timeframe === "1M") {
    throw new Error("detectGaps: monthly timeframe bucketing is not fixed-duration; not supported here");
  }
  const stepMs = timeframeMs(timeframe);
  const present = new Set(bars.map((b) => Number(bucketStart(b.bucketStartMs, timeframe))));
  const sorted = [...bars].sort((a, b) => a.bucketStartMs - b.bucketStartMs);
  const first = sorted[0]!.bucketStartMs;
  const last = sorted[sorted.length - 1]!.bucketStartMs;

  const gaps: DataGap[] = [];
  let gapStart: number | undefined;
  let missingCount = 0;

  for (let t = Number(first); t <= Number(last); t += stepMs) {
    const isExpectedOpen = calendar.is24x7 || calendar.isSessionOpen(t as EpochMillis, holidayDatesUtc);
    const hasBar = present.has(t);
    if (isExpectedOpen && !hasBar) {
      if (gapStart === undefined) gapStart = t;
      missingCount += 1;
    } else if (gapStart !== undefined) {
      gaps.push({ fromMs: gapStart, toMs: t - stepMs, missingBucketCount: missingCount });
      gapStart = undefined;
      missingCount = 0;
    }
  }
  if (gapStart !== undefined) {
    gaps.push({ fromMs: gapStart, toMs: last, missingBucketCount: missingCount });
  }
  return gaps;
}

export function isValidAggregationTarget(from: Timeframe, to: Timeframe): boolean {
  const fromIdx = AGGREGATION_ORDER.indexOf(from);
  const toIdx = AGGREGATION_ORDER.indexOf(to);
  return fromIdx !== -1 && toIdx !== -1 && toIdx > fromIdx;
}

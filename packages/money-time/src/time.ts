/**
 * Time & calendar utilities — timezone-safe timestamps, trading sessions, and
 * timeframe/duration math shared by market-data, TA, backtest, and risk engines.
 *
 * Convention: all timestamps are stored and compared as UTC epoch milliseconds
 * (`EpochMillis`). Human-facing session boundaries are computed by converting to
 * a named IANA timezone at the point of display/session-check only — never store
 * "local" wall-clock time as if it were absolute.
 */

export type EpochMillis = number & { readonly __brand: "EpochMillis" };

export function epochMillis(ms: number): EpochMillis {
  if (!Number.isFinite(ms)) throw new RangeError(`epochMillis: not finite (${ms})`);
  return ms as EpochMillis;
}

export function nowUtc(): EpochMillis {
  return epochMillis(Date.now());
}

export function fromIso(iso: string): EpochMillis {
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) throw new RangeError(`fromIso: cannot parse "${iso}"`);
  return epochMillis(ms);
}

export function toIso(t: EpochMillis): string {
  return new Date(t).toISOString();
}

/** Canonical bar/aggregation timeframes, ordered smallest to largest. */
export enum Timeframe {
  M1 = "1m",
  M5 = "5m",
  M15 = "15m",
  M30 = "30m",
  H1 = "1h",
  H4 = "4h",
  D1 = "1d",
  W1 = "1w",
  MN1 = "1M",
}

const TIMEFRAME_MS: Record<Exclude<Timeframe, Timeframe.MN1>, number> = {
  [Timeframe.M1]: 60_000,
  [Timeframe.M5]: 5 * 60_000,
  [Timeframe.M15]: 15 * 60_000,
  [Timeframe.M30]: 30 * 60_000,
  [Timeframe.H1]: 60 * 60_000,
  [Timeframe.H4]: 4 * 60 * 60_000,
  [Timeframe.D1]: 24 * 60 * 60_000,
  [Timeframe.W1]: 7 * 24 * 60 * 60_000,
};

/** Duration of a timeframe in milliseconds. MN1 (calendar month) has no fixed duration — use monthBucket() instead. */
export function timeframeMs(tf: Timeframe): number {
  if (tf === Timeframe.MN1) {
    throw new RangeError("timeframeMs: MN1 has variable length; use monthBucketStart() for bucketing");
  }
  return TIMEFRAME_MS[tf];
}

/** Floor a timestamp to the start of its containing bucket for a fixed-duration timeframe (UTC-aligned). */
export function bucketStart(t: EpochMillis, tf: Timeframe): EpochMillis {
  if (tf === Timeframe.MN1) return monthBucketStart(t);
  const ms = timeframeMs(tf);
  return epochMillis(Math.floor(t / ms) * ms);
}

export function monthBucketStart(t: EpochMillis): EpochMillis {
  const d = new Date(t);
  return epochMillis(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}

/** Ordered list of timeframes usable for upsampling M1 -> ... -> MN1 aggregation pipelines. */
export const AGGREGATION_ORDER: Timeframe[] = [
  Timeframe.M1,
  Timeframe.M5,
  Timeframe.M15,
  Timeframe.M30,
  Timeframe.H1,
  Timeframe.H4,
  Timeframe.D1,
  Timeframe.W1,
  Timeframe.MN1,
];

/** Day-count conventions used by fundamental/DCF/fixed-income-style calculations. */
export type DayCountConvention = "ACT/365" | "ACT/360" | "30/360";

export function yearFraction(startMs: EpochMillis, endMs: EpochMillis, convention: DayCountConvention): number {
  const days = (endMs - startMs) / (24 * 60 * 60_000);
  switch (convention) {
    case "ACT/365":
      return days / 365;
    case "ACT/360":
      return days / 360;
    case "30/360": {
      const s = new Date(startMs);
      const e = new Date(endMs);
      const d1 = Math.min(s.getUTCDate(), 30);
      const d2 = Math.min(e.getUTCDate(), 30);
      const months =
        (e.getUTCFullYear() - s.getUTCFullYear()) * 12 + (e.getUTCMonth() - s.getUTCMonth());
      return (months * 30 + (d2 - d1)) / 360;
    }
  }
}

/**
 * Trading session calendars. Each market defines whether a given UTC instant falls
 * within regular trading hours, used to gate "is this quote live/stale" logic and
 * to avoid weekend/holiday false-gaps in backtests.
 *
 * Holiday lists are intentionally NOT hardcoded here (they drift year to year and
 * a stale hardcoded list is worse than an honest "holidays not loaded" state) —
 * callers inject a holiday set; the calendar only encodes weekly session structure.
 * This keeps the module correct-by-construction rather than silently wrong after
 * a year passes with no maintenance.
 */
export interface SessionCalendar {
  readonly market: string;
  readonly timezone: string;
  readonly is24x7: boolean;
  isSessionOpen(t: EpochMillis, holidayDatesUtc?: ReadonlySet<string>): boolean;
}

function isoDateInTz(t: EpochMillis, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(t));
}

function minutesSinceMidnightInTz(t: EpochMillis, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(new Date(t));
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? "0") % 24;
  const minute = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
  return hour * 60 + minute;
}

function weekdayInTz(t: EpochMillis, timeZone: string): number {
  // 0 = Sunday .. 6 = Saturday
  const weekday = new Intl.DateTimeFormat("en-US", { timeZone, weekday: "short" }).format(new Date(t));
  return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(weekday);
}

function makeWeekdaySessionCalendar(
  market: string,
  timezone: string,
  openMinute: number,
  closeMinute: number,
): SessionCalendar {
  return {
    market,
    timezone,
    is24x7: false,
    isSessionOpen(t, holidayDatesUtc) {
      const wd = weekdayInTz(t, timezone);
      if (wd === 0 || wd === 6) return false;
      if (holidayDatesUtc?.has(isoDateInTz(t, timezone))) return false;
      const minute = minutesSinceMidnightInTz(t, timezone);
      return minute >= openMinute && minute < closeMinute;
    },
  };
}

/** US equities regular session: 09:30–16:00 America/New_York. */
export const US_EQUITIES_CALENDAR: SessionCalendar = makeWeekdaySessionCalendar(
  "US_EQUITIES",
  "America/New_York",
  9 * 60 + 30,
  16 * 60,
);

/** NSE/BSE India equities regular session: 09:15–15:30 Asia/Kolkata. */
export const NSE_BSE_CALENDAR: SessionCalendar = makeWeekdaySessionCalendar(
  "NSE_BSE",
  "Asia/Kolkata",
  9 * 60 + 15,
  15 * 60 + 30,
);

/** Forex: effectively continuous Sun 22:00 UTC -> Fri 22:00 UTC across global sessions; approximate weekday gate. */
export const FOREX_CALENDAR: SessionCalendar = {
  market: "FOREX",
  timezone: "UTC",
  is24x7: false,
  isSessionOpen(t) {
    const d = new Date(t);
    const wd = d.getUTCDay();
    const hour = d.getUTCHours();
    if (wd === 6) return false; // Saturday: closed
    if (wd === 0 && hour < 22) return false; // Sunday before 22:00 UTC: closed
    if (wd === 5 && hour >= 22) return false; // Friday after 22:00 UTC: closed
    return true;
  },
};

/** Crypto markets trade continuously. */
export const CRYPTO_CALENDAR: SessionCalendar = {
  market: "CRYPTO",
  timezone: "UTC",
  is24x7: true,
  isSessionOpen: () => true,
};

export function calendarForMarket(market: "US_EQUITIES" | "NSE_BSE" | "FOREX" | "CRYPTO"): SessionCalendar {
  switch (market) {
    case "US_EQUITIES":
      return US_EQUITIES_CALENDAR;
    case "NSE_BSE":
      return NSE_BSE_CALENDAR;
    case "FOREX":
      return FOREX_CALENDAR;
    case "CRYPTO":
      return CRYPTO_CALENDAR;
  }
}

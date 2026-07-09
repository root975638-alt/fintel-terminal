import { describe, expect, it } from "vitest";
import {
  bucketStart,
  epochMillis,
  fromIso,
  timeframeMs,
  Timeframe,
  US_EQUITIES_CALENDAR,
  NSE_BSE_CALENDAR,
  CRYPTO_CALENDAR,
  FOREX_CALENDAR,
  yearFraction,
} from "../src/time.js";

describe("timeframeMs", () => {
  it("returns correct fixed durations", () => {
    expect(timeframeMs(Timeframe.M1)).toBe(60_000);
    expect(timeframeMs(Timeframe.H1)).toBe(60 * 60_000);
    expect(timeframeMs(Timeframe.D1)).toBe(24 * 60 * 60_000);
  });

  it("throws for MN1 (variable-length month)", () => {
    expect(() => timeframeMs(Timeframe.MN1)).toThrow();
  });
});

describe("bucketStart", () => {
  it("floors a timestamp to the correct UTC-aligned bucket", () => {
    const t = fromIso("2024-03-15T10:37:22.000Z");
    const bucket = bucketStart(t, Timeframe.H1);
    expect(new Date(bucket).toISOString()).toBe("2024-03-15T10:00:00.000Z");
  });
});

describe("US_EQUITIES_CALENDAR", () => {
  it("is open during regular trading hours on a weekday", () => {
    // 2024-03-15 (Friday) 15:00 UTC = 11:00 America/New_York (within 09:30-16:00 session)
    const t = fromIso("2024-03-15T15:00:00.000Z");
    expect(US_EQUITIES_CALENDAR.isSessionOpen(t)).toBe(true);
  });

  it("is closed outside regular trading hours", () => {
    // 2024-03-15 03:00 UTC = 23:00 previous day America/New_York (well outside session)
    const t = fromIso("2024-03-15T03:00:00.000Z");
    expect(US_EQUITIES_CALENDAR.isSessionOpen(t)).toBe(false);
  });

  it("is closed on weekends", () => {
    // 2024-03-16 is a Saturday
    const t = fromIso("2024-03-16T15:00:00.000Z");
    expect(US_EQUITIES_CALENDAR.isSessionOpen(t)).toBe(false);
  });

  it("respects an injected holiday set", () => {
    const t = fromIso("2024-03-15T15:00:00.000Z"); // otherwise a valid trading moment
    const holidays = new Set(["2024-03-15"]);
    expect(US_EQUITIES_CALENDAR.isSessionOpen(t, holidays)).toBe(false);
  });
});

describe("NSE_BSE_CALENDAR", () => {
  it("is open during Indian market hours on a weekday", () => {
    // 2024-03-15 10:00 UTC = 15:30 IST (within 09:15-15:30 session, at the boundary)
    const t = fromIso("2024-03-15T09:00:00.000Z"); // 14:30 IST — within session
    expect(NSE_BSE_CALENDAR.isSessionOpen(t)).toBe(true);
  });

  it("is closed on weekends", () => {
    const t = fromIso("2024-03-16T09:00:00.000Z");
    expect(NSE_BSE_CALENDAR.isSessionOpen(t)).toBe(false);
  });
});

describe("CRYPTO_CALENDAR", () => {
  it("is always open (24/7)", () => {
    expect(CRYPTO_CALENDAR.is24x7).toBe(true);
    expect(CRYPTO_CALENDAR.isSessionOpen(epochMillis(Date.now()))).toBe(true);
    // Even on a weekend / holiday, crypto never closes.
    const saturday = fromIso("2024-03-16T12:00:00.000Z");
    expect(CRYPTO_CALENDAR.isSessionOpen(saturday)).toBe(true);
  });
});

describe("FOREX_CALENDAR", () => {
  it("is closed on Saturday", () => {
    const saturday = fromIso("2024-03-16T12:00:00.000Z");
    expect(FOREX_CALENDAR.isSessionOpen(saturday)).toBe(false);
  });

  it("is open midweek", () => {
    const wednesday = fromIso("2024-03-13T12:00:00.000Z");
    expect(FOREX_CALENDAR.isSessionOpen(wednesday)).toBe(true);
  });
});

describe("yearFraction", () => {
  it("computes ACT/365 correctly for exactly one year (365 days)", () => {
    const start = fromIso("2023-01-01T00:00:00.000Z");
    const end = fromIso("2024-01-01T00:00:00.000Z"); // 2023 is not a leap year: exactly 365 days
    const frac = yearFraction(start, end, "ACT/365");
    expect(frac).toBeCloseTo(1, 5);
  });

  it("computes 30/360 correctly for exactly one month", () => {
    const start = fromIso("2024-01-15T00:00:00.000Z");
    const end = fromIso("2024-02-15T00:00:00.000Z");
    const frac = yearFraction(start, end, "30/360");
    expect(frac).toBeCloseTo(30 / 360, 5);
  });
});

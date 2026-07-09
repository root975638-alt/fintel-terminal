import { describe, expect, it } from "vitest";
import { Money } from "../src/money.js";

describe("Money", () => {
  it("parses and round-trips exact decimal strings without float error", () => {
    const m = Money.fromDecimalString("123.45600000", { scale: 8 });
    expect(m.toDecimalString()).toBe("123.45600000");
  });

  it("avoids classic float rounding errors (0.1 + 0.2 problem)", () => {
    const a = Money.fromDecimalString("0.1", { scale: 8 });
    const b = Money.fromDecimalString("0.2", { scale: 8 });
    expect(a.add(b).toDecimalString()).toBe("0.30000000");
  });

  it("adds and subtracts exactly", () => {
    const a = Money.fromDecimalString("100.50", { scale: 2 });
    const b = Money.fromDecimalString("50.25", { scale: 2 });
    expect(a.add(b).toDecimalString()).toBe("150.75");
    expect(a.sub(b).toDecimalString()).toBe("50.25");
  });

  it("throws on currency mismatch", () => {
    const usd = Money.fromDecimalString("10", { currency: "USD" });
    const eur = Money.fromDecimalString("10", { currency: "EUR" });
    expect(() => usd.add(eur)).toThrow(/currency mismatch/);
  });

  it("multiplies by quantity correctly (price * shares)", () => {
    const price = Money.fromDecimalString("19.99", { scale: 2 });
    const total = price.mulQty(100);
    expect(total.toDecimalString()).toBe("1999.00");
  });

  it("compares magnitudes correctly", () => {
    const a = Money.fromDecimalString("10.00");
    const b = Money.fromDecimalString("20.00");
    expect(a.cmp(b)).toBe(-1);
    expect(b.cmp(a)).toBe(1);
    expect(a.cmp(a)).toBe(0);
  });

  it("rounds half-even (banker's rounding) correctly at the boundary", () => {
    const a = Money.fromDecimalString("2.5", { scale: 1 });
    const b = Money.fromDecimalString("3.5", { scale: 1 });
    expect(a.round(0, "half-even").toDecimalString()).toBe("2"); // rounds to even
    expect(b.round(0, "half-even").toDecimalString()).toBe("4"); // rounds to even
  });

  it("rounds half-up correctly", () => {
    const a = Money.fromDecimalString("2.5", { scale: 1 });
    expect(a.round(0, "half-up").toDecimalString()).toBe("3");
  });

  it("handles negative values correctly", () => {
    const a = Money.fromDecimalString("-10.50", { scale: 2 });
    expect(a.isNegative()).toBe(true);
    expect(a.abs().toDecimalString()).toBe("10.50");
    expect(a.neg().toDecimalString()).toBe("10.50");
  });
});

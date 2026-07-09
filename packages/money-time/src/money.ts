/**
 * Money — exact fixed-point arithmetic for prices, cash, and P&L.
 *
 * Rationale: IEEE-754 doubles introduce rounding error that compounds across
 * millions of trades/backtests. Money stores an integer count of "minor units"
 * (e.g. cents, satoshis, or a configurable number of decimal places per asset
 * class) as a BigInt, so arithmetic is exact until an explicit rounding step.
 *
 * Never construct Money from a raw float without going through fromDecimalString
 * or fromNumber (which documents the precision loss it accepts).
 */

export type RoundingMode = "half-up" | "half-even" | "floor" | "ceil" | "truncate";

export interface MoneyOptions {
  /** Number of decimal places represented by this Money's scale. Default 8 (covers most crypto + FX pip precision). */
  scale?: number;
  /** ISO 4217 currency code or asset symbol this value is denominated in (informational, checked on arithmetic). */
  currency?: string;
}

const DEFAULT_SCALE = 8;

function pow10(n: number): bigint {
  let result = 1n;
  for (let i = 0; i < n; i++) result *= 10n;
  return result;
}

export class Money {
  readonly minorUnits: bigint;
  readonly scale: number;
  readonly currency: string;

  private constructor(minorUnits: bigint, scale: number, currency: string) {
    this.minorUnits = minorUnits;
    this.scale = scale;
    this.currency = currency;
  }

  static zero(opts: MoneyOptions = {}): Money {
    return new Money(0n, opts.scale ?? DEFAULT_SCALE, opts.currency ?? "USD");
  }

  /** Construct from an exact decimal string, e.g. "123.45600000". Preferred entry point. */
  static fromDecimalString(value: string, opts: MoneyOptions = {}): Money {
    const scale = opts.scale ?? DEFAULT_SCALE;
    const currency = opts.currency ?? "USD";
    const negative = value.trim().startsWith("-");
    const parts = value.trim().replace(/^-/, "").split(".");
    const wholeRaw: string = parts[0] ?? "";
    const fracRaw: string = parts[1] ?? "";
    const whole = wholeRaw === "" ? "0" : wholeRaw;
    const frac = (fracRaw + "0".repeat(scale)).slice(0, scale);
    if (!/^\d+$/.test(whole) || !/^\d*$/.test(fracRaw)) {
      throw new RangeError(`Money.fromDecimalString: invalid decimal literal "${value}"`);
    }
    const magnitude = BigInt(whole) * pow10(scale) + BigInt(frac === "" ? "0" : frac);
    return new Money(negative ? -magnitude : magnitude, scale, currency);
  }

  /**
   * Construct from a JS number. DOCUMENTED PRECISION LOSS: numbers above 2^53 or with
   * more significant digits than a double can represent will lose precision before this
   * function ever sees them. Prefer fromDecimalString wherever the source is text (APIs,
   * CSV, scraped pages).
   */
  static fromNumber(value: number, opts: MoneyOptions = {}): Money {
    if (!Number.isFinite(value)) {
      throw new RangeError(`Money.fromNumber: value must be finite, got ${value}`);
    }
    return Money.fromDecimalString(value.toFixed(opts.scale ?? DEFAULT_SCALE), opts);
  }

  static fromMinorUnits(minorUnits: bigint, opts: MoneyOptions = {}): Money {
    return new Money(minorUnits, opts.scale ?? DEFAULT_SCALE, opts.currency ?? "USD");
  }

  private assertSameDenomination(other: Money): void {
    if (this.currency !== other.currency) {
      throw new TypeError(
        `Money: currency mismatch (${this.currency} vs ${other.currency}) — convert explicitly before arithmetic`,
      );
    }
  }

  private rescale(targetScale: number): Money {
    if (targetScale === this.scale) return this;
    if (targetScale > this.scale) {
      return new Money(this.minorUnits * pow10(targetScale - this.scale), targetScale, this.currency);
    }
    const divisor = pow10(this.scale - targetScale);
    return new Money(this.minorUnits / divisor, targetScale, this.currency); // truncating rescale-down; use round() first if needed
  }

  add(other: Money): Money {
    this.assertSameDenomination(other);
    const scale = Math.max(this.scale, other.scale);
    const a = this.rescale(scale);
    const b = other.rescale(scale);
    return new Money(a.minorUnits + b.minorUnits, scale, this.currency);
  }

  sub(other: Money): Money {
    this.assertSameDenomination(other);
    const scale = Math.max(this.scale, other.scale);
    const a = this.rescale(scale);
    const b = other.rescale(scale);
    return new Money(a.minorUnits - b.minorUnits, scale, this.currency);
  }

  /** Multiply by a plain quantity (e.g. shares/units) — quantity is a JS number, exact within safe-integer range. */
  mulQty(quantity: number): Money {
    if (!Number.isFinite(quantity)) throw new RangeError("Money.mulQty: quantity must be finite");
    // Represent quantity at high internal precision to avoid float error, then truncate to this.scale.
    const qScale = 12;
    const qMinor = BigInt(Math.round(quantity * Number(pow10(qScale))));
    const product = (this.minorUnits * qMinor) / pow10(qScale);
    return new Money(product, this.scale, this.currency);
  }

  neg(): Money {
    return new Money(-this.minorUnits, this.scale, this.currency);
  }

  abs(): Money {
    return new Money(this.minorUnits < 0n ? -this.minorUnits : this.minorUnits, this.scale, this.currency);
  }

  cmp(other: Money): -1 | 0 | 1 {
    this.assertSameDenomination(other);
    const scale = Math.max(this.scale, other.scale);
    const a = this.rescale(scale).minorUnits;
    const b = other.rescale(scale).minorUnits;
    if (a < b) return -1;
    if (a > b) return 1;
    return 0;
  }

  isZero(): boolean {
    return this.minorUnits === 0n;
  }

  isNegative(): boolean {
    return this.minorUnits < 0n;
  }

  /** Round down to fewer decimal places using the given rounding mode; returns a new Money at targetScale. */
  round(targetScale: number, mode: RoundingMode = "half-even"): Money {
    if (targetScale >= this.scale) return this.rescale(targetScale);
    const divisor = pow10(this.scale - targetScale);
    const negative = this.minorUnits < 0n;
    const magnitude = negative ? -this.minorUnits : this.minorUnits;
    const quotient = magnitude / divisor;
    const remainder = magnitude % divisor;
    let rounded = quotient;
    switch (mode) {
      case "truncate":
        break;
      case "floor":
        rounded = negative && remainder !== 0n ? quotient + 1n : quotient;
        break;
      case "ceil":
        rounded = !negative && remainder !== 0n ? quotient + 1n : quotient;
        break;
      case "half-up":
        if (remainder * 2n >= divisor) rounded = quotient + 1n;
        break;
      case "half-even":
      default: {
        const twice = remainder * 2n;
        if (twice > divisor || (twice === divisor && quotient % 2n === 1n)) rounded = quotient + 1n;
        break;
      }
    }
    const signed = negative ? -rounded : rounded;
    return new Money(signed, targetScale, this.currency);
  }

  toDecimalString(): string {
    const negative = this.minorUnits < 0n;
    const magnitude = negative ? -this.minorUnits : this.minorUnits;
    const divisor = pow10(this.scale);
    const whole = magnitude / divisor;
    const frac = (magnitude % divisor).toString().padStart(this.scale, "0");
    const fracTrimmed = this.scale > 0 ? `.${frac}` : "";
    return `${negative ? "-" : ""}${whole.toString()}${fracTrimmed}`;
  }

  /** Convert to a JS number. DOCUMENTED PRECISION LOSS beyond double precision — for display/charting only, never for accounting. */
  toNumber(): number {
    return Number(this.toDecimalString());
  }

  toJSON(): string {
    return this.toDecimalString();
  }

  toString(): string {
    return `${this.toDecimalString()} ${this.currency}`;
  }
}

/**
 * Technical Analysis Engine — deterministic, versioned indicator implementations.
 *
 * All indicators operate on plain `number[]` (closing/high/low prices as floats).
 * This is a DELIBERATE, DOCUMENTED precision trade-off: TA indicators are
 * analytics/display artifacts, never used for money/accounting math (which stays
 * in @fintel/money-time's exact Money type end-to-end). Converting Bar decimal
 * strings to numbers happens at the boundary where a caller invokes these
 * functions, not inside the persistence/domain layers.
 *
 * Every function returns an array the SAME LENGTH as its input, with `null` in
 * positions where insufficient history exists yet — callers must never
 * misinterpret a missing leading value as "zero".
 */

export const TA_ENGINE_VERSION = "1.0.0";

export type Series = readonly number[];
export type IndicatorSeries = readonly (number | null)[];

function assertPositivePeriod(period: number, fnName: string): void {
  if (!Number.isInteger(period) || period <= 0) {
    throw new RangeError(`${fnName}: period must be a positive integer, got ${period}`);
  }
}

/** Simple Moving Average: SMA_t = mean(x_{t-n+1..t}). */
export function sma(values: Series, period: number): IndicatorSeries {
  assertPositivePeriod(period, "sma");
  const result: (number | null)[] = new Array(values.length).fill(null);
  let windowSum = 0;
  for (let i = 0; i < values.length; i++) {
    windowSum += values[i]!;
    if (i >= period) windowSum -= values[i - period]!;
    if (i >= period - 1) result[i] = windowSum / period;
  }
  return result;
}

/** Exponential Moving Average with alpha = 2 / (period + 1), seeded by the SMA of the first `period` values. */
export function ema(values: Series, period: number): IndicatorSeries {
  assertPositivePeriod(period, "ema");
  const result: (number | null)[] = new Array(values.length).fill(null);
  const alpha = 2 / (period + 1);
  let prevEma: number | undefined;
  let seedSum = 0;
  for (let i = 0; i < values.length; i++) {
    if (i < period - 1) {
      seedSum += values[i]!;
      continue;
    }
    if (i === period - 1) {
      seedSum += values[i]!;
      prevEma = seedSum / period;
      result[i] = prevEma;
      continue;
    }
    prevEma = values[i]! * alpha + prevEma! * (1 - alpha);
    result[i] = prevEma;
  }
  return result;
}

/** Weighted Moving Average: weights 1..n applied to oldest..newest within the window. */
export function wma(values: Series, period: number): IndicatorSeries {
  assertPositivePeriod(period, "wma");
  const result: (number | null)[] = new Array(values.length).fill(null);
  const denom = (period * (period + 1)) / 2;
  for (let i = period - 1; i < values.length; i++) {
    let acc = 0;
    for (let w = 1; w <= period; w++) {
      acc += values[i - period + w]! * w;
    }
    result[i] = acc / denom;
  }
  return result;
}

/**
 * Relative Strength Index using Wilder's original smoothing method (not a plain
 * SMA of gains/losses — Wilder's smoothing is itself a specific EMA-like recursion
 * with alpha = 1/period, which is the historically correct and widely-implemented
 * definition of "RSI").
 */
export function rsiWilder(values: Series, period = 14): IndicatorSeries {
  assertPositivePeriod(period, "rsiWilder");
  const result: (number | null)[] = new Array(values.length).fill(null);
  if (values.length <= period) return result;

  let gainSum = 0;
  let lossSum = 0;
  for (let i = 1; i <= period; i++) {
    const change = values[i]! - values[i - 1]!;
    if (change > 0) gainSum += change;
    else lossSum += -change;
  }
  let avgGain = gainSum / period;
  let avgLoss = lossSum / period;
  result[period] = computeRsiFromAvgs(avgGain, avgLoss);

  for (let i = period + 1; i < values.length; i++) {
    const change = values[i]! - values[i - 1]!;
    const gain = change > 0 ? change : 0;
    const loss = change < 0 ? -change : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
    result[i] = computeRsiFromAvgs(avgGain, avgLoss);
  }
  return result;
}

function computeRsiFromAvgs(avgGain: number, avgLoss: number): number {
  if (avgLoss === 0) return avgGain === 0 ? 50 : 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

export interface MacdResult {
  readonly macdLine: IndicatorSeries;
  readonly signalLine: IndicatorSeries;
  readonly histogram: IndicatorSeries;
}

/** MACD: fast EMA − slow EMA, with a signal EMA of the MACD line (defaults 12/26/9). */
export function macd(values: Series, fastPeriod = 12, slowPeriod = 26, signalPeriod = 9): MacdResult {
  const fastEma = ema(values, fastPeriod);
  const slowEma = ema(values, slowPeriod);
  const macdLine: (number | null)[] = values.map((_, i) => {
    const f = fastEma[i];
    const s = slowEma[i];
    return f !== null && f !== undefined && s !== null && s !== undefined ? f - s : null;
  });

  // Signal line is an EMA of the MACD line, computed only over its defined (non-null) tail.
  const firstDefinedIdx = macdLine.findIndex((v) => v !== null);
  const signalLine: (number | null)[] = new Array(values.length).fill(null);
  if (firstDefinedIdx !== -1) {
    const macdTail = macdLine.slice(firstDefinedIdx).map((v) => v as number);
    const signalTail = ema(macdTail, signalPeriod);
    for (let i = 0; i < signalTail.length; i++) {
      signalLine[firstDefinedIdx + i] = signalTail[i]!;
    }
  }

  const histogram: (number | null)[] = values.map((_, i) => {
    const m = macdLine[i];
    const s = signalLine[i];
    return m !== null && m !== undefined && s !== null && s !== undefined ? m - s : null;
  });

  return { macdLine, signalLine, histogram };
}

export interface BollingerBandsResult {
  readonly upper: IndicatorSeries;
  readonly middle: IndicatorSeries;
  readonly lower: IndicatorSeries;
}

/** Bollinger Bands: middle = SMA(period); upper/lower = middle ± k * population std-dev over the same window. */
export function bollingerBands(values: Series, period = 20, k = 2): BollingerBandsResult {
  assertPositivePeriod(period, "bollingerBands");
  const middle = sma(values, period);
  const upper: (number | null)[] = new Array(values.length).fill(null);
  const lower: (number | null)[] = new Array(values.length).fill(null);

  for (let i = period - 1; i < values.length; i++) {
    const window = values.slice(i - period + 1, i + 1);
    const mean = middle[i] as number;
    const variance = window.reduce((acc, v) => acc + (v - mean) ** 2, 0) / period;
    const stdDev = Math.sqrt(variance);
    upper[i] = mean + k * stdDev;
    lower[i] = mean - k * stdDev;
  }
  return { upper, middle, lower };
}

/**
 * Average True Range using Wilder's smoothing. True Range_t = max(high-low, |high-prevClose|, |low-prevClose|).
 */
export function atrWilder(highs: Series, lows: Series, closes: Series, period = 14): IndicatorSeries {
  assertPositivePeriod(period, "atrWilder");
  const n = highs.length;
  if (lows.length !== n || closes.length !== n) {
    throw new RangeError("atrWilder: highs, lows, and closes must have equal length");
  }
  const trueRanges: number[] = new Array(n).fill(0);
  for (let i = 0; i < n; i++) {
    if (i === 0) {
      trueRanges[i] = highs[i]! - lows[i]!;
      continue;
    }
    const prevClose = closes[i - 1]!;
    trueRanges[i] = Math.max(highs[i]! - lows[i]!, Math.abs(highs[i]! - prevClose), Math.abs(lows[i]! - prevClose));
  }

  const result: (number | null)[] = new Array(n).fill(null);
  if (n <= period) return result;

  let sum = 0;
  for (let i = 1; i <= period; i++) sum += trueRanges[i]!;
  let prevAtr = sum / period;
  result[period] = prevAtr;

  for (let i = period + 1; i < n; i++) {
    prevAtr = (prevAtr * (period - 1) + trueRanges[i]!) / period;
    result[i] = prevAtr;
  }
  return result;
}

/** Historical (realized) volatility: annualized std-dev of log returns. periodsPerYear e.g. 252 for daily bars. */
export function historicalVolatility(closes: Series, periodsPerYear = 252): number {
  if (closes.length < 2) return 0;
  const logReturns: number[] = [];
  for (let i = 1; i < closes.length; i++) {
    logReturns.push(Math.log(closes[i]! / closes[i - 1]!));
  }
  const mean = logReturns.reduce((a, b) => a + b, 0) / logReturns.length;
  const variance = logReturns.reduce((acc, r) => acc + (r - mean) ** 2, 0) / logReturns.length;
  return Math.sqrt(variance) * Math.sqrt(periodsPerYear);
}

export function decimalStringsToNumbers(values: readonly string[]): number[] {
  return values.map((v) => {
    const n = Number(v);
    if (!Number.isFinite(n)) throw new RangeError(`decimalStringsToNumbers: "${v}" is not a finite number`);
    return n;
  });
}

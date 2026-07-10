/**
 * Valuation models — DCF (discounted cash flow) and comparables. Every
 * result carries its full set of assumptions alongside it (spec: "state
 * method + assumptions for every model" — never a bare valuation number).
 */

export interface DcfAssumptions {
  readonly discountRateAnnual: number; // WACC or required rate of return
  readonly terminalGrowthRateAnnual: number; // perpetual growth rate applied to the terminal year
  readonly projectionYears: number;
}

export interface DcfResult {
  readonly presentValueOfProjectedCashFlows: number;
  readonly presentValueOfTerminalValue: number;
  readonly enterpriseValue: number;
  readonly assumptions: DcfAssumptions;
  readonly honestyLabel: "ESTABLISHED"; // the DCF METHOD is textbook-established; the INPUT cash flow projections are not (that's the caller's assumption to own)
  readonly warnings: readonly string[];
}

/**
 * Discounted Cash Flow using the standard two-stage model: explicit
 * projected free cash flows, then a Gordon Growth terminal value on the
 * final projected year.
 *
 * `projectedFreeCashFlows` must be supplied by the caller (this module does
 * not forecast cash flows itself — that would require assumptions this
 * module has no basis to make honestly). Terminal growth rate MUST be less
 * than the discount rate or the terminal value formula is mathematically
 * undefined (would imply infinite value) — this is validated and surfaced
 * as a warning, never silently computed as Infinity/NaN.
 */
export function discountedCashFlow(
  projectedFreeCashFlows: readonly number[],
  assumptions: DcfAssumptions,
): DcfResult {
  const warnings: string[] = [];
  const { discountRateAnnual: r, terminalGrowthRateAnnual: g } = assumptions;

  if (g >= r) {
    warnings.push(
      `Terminal growth rate (${(g * 100).toFixed(2)}%) must be strictly less than the discount rate ` +
        `(${(r * 100).toFixed(2)}%) for the Gordon Growth terminal value to be finite/meaningful. ` +
        `Result is NOT reliable with these assumptions.`,
    );
  }
  if (projectedFreeCashFlows.length === 0) {
    return {
      presentValueOfProjectedCashFlows: 0,
      presentValueOfTerminalValue: 0,
      enterpriseValue: 0,
      assumptions,
      honestyLabel: "ESTABLISHED",
      warnings: [...warnings, "No projected cash flows supplied; result is zero by definition, not meaningful."],
    };
  }

  let presentValueOfProjectedCashFlows = 0;
  for (let t = 1; t <= projectedFreeCashFlows.length; t++) {
    const cf = projectedFreeCashFlows[t - 1]!;
    presentValueOfProjectedCashFlows += cf / Math.pow(1 + r, t);
  }

  const lastCf = projectedFreeCashFlows[projectedFreeCashFlows.length - 1]!;
  const n = projectedFreeCashFlows.length;
  const terminalValueAtYearN = g < r ? (lastCf * (1 + g)) / (r - g) : NaN;
  const presentValueOfTerminalValue = Number.isFinite(terminalValueAtYearN)
    ? terminalValueAtYearN / Math.pow(1 + r, n)
    : 0;

  if (!Number.isFinite(terminalValueAtYearN)) {
    warnings.push("Terminal value is undefined given g >= r; terminal value contribution reported as 0, not extrapolated.");
  }

  return {
    presentValueOfProjectedCashFlows,
    presentValueOfTerminalValue,
    enterpriseValue: presentValueOfProjectedCashFlows + presentValueOfTerminalValue,
    assumptions,
    honestyLabel: "ESTABLISHED",
    warnings,
  };
}

export interface ComparablesResult {
  readonly impliedValuePerShare: number;
  readonly peerMultipleUsed: number;
  readonly metricUsed: string;
  readonly honestyLabel: "EXPERIMENTAL"; // comparables depend entirely on peer-set selection, which is subjective
  readonly warnings: readonly string[];
}

/**
 * Comparables valuation: applies a peer group's average/median multiple to
 * the target's own metric (e.g. peer average P/E * target EPS = implied
 * price). Labeled EXPERIMENTAL because peer-set selection is inherently
 * subjective and this function has no way to validate the peer set's
 * appropriateness — that judgment belongs to the caller.
 */
export function comparablesValuation(
  targetMetricPerShare: number,
  peerMultiples: readonly number[],
  metricName: string,
): ComparablesResult {
  const warnings: string[] = [];
  if (peerMultiples.length === 0) {
    return {
      impliedValuePerShare: 0,
      peerMultipleUsed: 0,
      metricUsed: metricName,
      honestyLabel: "EXPERIMENTAL",
      warnings: ["No peer multiples supplied; result is zero by definition, not meaningful."],
    };
  }
  const sorted = [...peerMultiples].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 === 0 ? (sorted[mid - 1]! + sorted[mid]!) / 2 : sorted[mid]!;

  if (peerMultiples.length < 3) {
    warnings.push(`Only ${peerMultiples.length} peer(s) supplied — a peer set this small is unlikely to be representative.`);
  }

  return {
    impliedValuePerShare: targetMetricPerShare * median,
    peerMultipleUsed: median,
    metricUsed: metricName,
    honestyLabel: "EXPERIMENTAL",
    warnings,
  };
}

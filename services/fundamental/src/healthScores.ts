/**
 * Financial health/quality heuristic scores — Piotroski F-score and Altman
 * Z-score. Both are LABELED HEURISTIC CLASSIFIERS, never predictions: a low
 * score does not mean a company WILL fail, and a high score does not mean it
 * WON'T. These are decades-old academic heuristics with known false-positive/
 * false-negative rates; treat as one input among many, never a verdict.
 */

export interface PiotroskiInputs {
  readonly roa: number;
  readonly priorRoa: number;
  readonly operatingCashFlow: number;
  readonly netIncome: number;
  readonly longTermDebt: number;
  readonly priorLongTermDebt: number;
  readonly totalAssets: number;
  readonly priorTotalAssets: number;
  readonly currentRatio: number;
  readonly priorCurrentRatio: number;
  readonly sharesOutstanding: number;
  readonly priorSharesOutstanding: number;
  readonly grossMargin: number;
  readonly priorGrossMargin: number;
  readonly revenue: number;
  readonly priorRevenue: number;
}

export interface PiotroskiResult {
  readonly score: number; // 0-9
  readonly criteria: Readonly<Record<string, boolean>>;
  readonly honestyLabel: "EXPERIMENTAL";
  readonly interpretationNote: string;
}

/**
 * Piotroski F-Score: 9 binary criteria across profitability, leverage/liquidity,
 * and operating efficiency, each worth 1 point. Higher (7-9) is conventionally
 * read as "improving fundamentals"; lower (0-2) as "deteriorating" — but this
 * is a heuristic screen from academic literature (Piotroski, 2000), not a
 * validated predictor for any specific company.
 */
export function piotroskiFScore(inputs: PiotroskiInputs): PiotroskiResult {
  const debtRatio = inputs.longTermDebt / inputs.totalAssets;
  const priorDebtRatio = inputs.priorLongTermDebt / inputs.priorTotalAssets;
  const assetTurnover = inputs.revenue / inputs.totalAssets;
  const priorAssetTurnover = inputs.priorRevenue / inputs.priorTotalAssets;

  const criteria: Record<string, boolean> = {
    positiveRoa: inputs.roa > 0,
    positiveOperatingCashFlow: inputs.operatingCashFlow > 0,
    roaImproved: inputs.roa > inputs.priorRoa,
    cashFlowExceedsNetIncome: inputs.operatingCashFlow > inputs.netIncome, // earnings quality check
    leverageDecreased: debtRatio < priorDebtRatio,
    liquidityImproved: inputs.currentRatio > inputs.priorCurrentRatio,
    noNewSharesIssued: inputs.sharesOutstanding <= inputs.priorSharesOutstanding,
    grossMarginImproved: inputs.grossMargin > inputs.priorGrossMargin,
    assetTurnoverImproved: assetTurnover > priorAssetTurnover,
  };

  const score = Object.values(criteria).filter(Boolean).length;

  return {
    score,
    criteria,
    honestyLabel: "EXPERIMENTAL",
    interpretationNote:
      "Piotroski F-Score is a 9-point academic heuristic screen (Piotroski, 2000), not a validated predictor " +
      "for any individual company. Conventionally: 7-9 = improving fundamentals, 3-6 = mixed, 0-2 = deteriorating " +
      "— treat as ONE input among many, never a standalone verdict.",
  };
}

export interface AltmanZInputs {
  readonly workingCapital: number;
  readonly totalAssets: number;
  readonly retainedEarnings: number;
  readonly ebit: number;
  readonly marketValueOfEquity: number;
  readonly totalLiabilities: number;
  readonly revenue: number;
}

export type AltmanZone = "safe" | "grey" | "distress";

export interface AltmanZResult {
  readonly zScore: number;
  readonly zone: AltmanZone;
  readonly honestyLabel: "EXPERIMENTAL";
  readonly interpretationNote: string;
}

/**
 * Altman Z-Score (original 1968 public-manufacturer formula):
 * Z = 1.2*A + 1.4*B + 3.3*C + 0.6*D + 1.0*E, where
 * A = working capital / total assets, B = retained earnings / total assets,
 * C = EBIT / total assets, D = market value of equity / total liabilities,
 * E = revenue / total assets.
 *
 * Zones (Altman's own thresholds): Z > 2.99 = "safe", 1.81-2.99 = "grey",
 * < 1.81 = "distress". Developed for public manufacturing firms; applying it
 * to other sectors (financials, services, tech with low fixed assets) is a
 * known limitation of the model, not of this implementation — the formula is
 * applied exactly as specified regardless of sector, and callers should treat
 * results for non-manufacturing firms with extra skepticism.
 */
export function altmanZScore(inputs: AltmanZInputs): AltmanZResult {
  const a = inputs.workingCapital / inputs.totalAssets;
  const b = inputs.retainedEarnings / inputs.totalAssets;
  const c = inputs.ebit / inputs.totalAssets;
  const d = inputs.marketValueOfEquity / inputs.totalLiabilities;
  const e = inputs.revenue / inputs.totalAssets;

  const zScore = 1.2 * a + 1.4 * b + 3.3 * c + 0.6 * d + 1.0 * e;
  const zone: AltmanZone = zScore > 2.99 ? "safe" : zScore >= 1.81 ? "grey" : "distress";

  return {
    zScore,
    zone,
    honestyLabel: "EXPERIMENTAL",
    interpretationNote:
      "Altman Z-Score (1968 formula) was developed and validated for public manufacturing firms; applying it " +
      "to financials, services, or asset-light tech companies is a known limitation — treat results for those " +
      "sectors with extra skepticism. This is a heuristic classification, not a bankruptcy prediction.",
  };
}

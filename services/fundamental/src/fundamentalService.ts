/**
 * Fundamental service — wires the SEC EDGAR adapter (already built in
 * data-acquisition) into a point-in-time fundamentals pipeline: fetch company
 * facts -> extract the latest annual (10-K) value per concept -> compute
 * ratios/health-scores. Missing concepts return `undefined`/`null` rather
 * than a fabricated value or a crash — SEC filers do not use 100% consistent
 * XBRL tagging, and this must degrade honestly.
 */
import type { SecEdgarAdapter, SecCompanyFacts, SecFactUnit } from "@fintel/data-acquisition";
import * as ratios from "./ratios.js";
import { piotroskiFScore, altmanZScore, type PiotroskiResult, type AltmanZResult } from "./healthScores.js";

/** Curated CIK lookup for the Milestone 1 seed instrument catalogue (US equities only — SEC EDGAR is US-only). */
export const SEED_CIK_BY_INSTRUMENT: Readonly<Record<string, string>> = {
  "US_EQUITIES:AAPL": "0000320193",
  "US_EQUITIES:MSFT": "0000789019",
};

/** us-gaap XBRL concept names this service knows how to look for. Not every filer tags every concept identically. */
const CONCEPTS = {
  revenue: ["RevenueFromContractWithCustomerExcludingAssessedTax", "Revenues"],
  netIncome: ["NetIncomeLoss"],
  operatingIncome: ["OperatingIncomeLoss"],
  grossProfit: ["GrossProfit"],
  totalAssets: ["Assets"],
  totalLiabilities: ["Liabilities"],
  totalEquity: ["StockholdersEquity"],
  currentAssets: ["AssetsCurrent"],
  currentLiabilities: ["LiabilitiesCurrent"],
  inventory: ["InventoryNet"],
  cash: ["CashAndCashEquivalentsAtCarryingValue", "CashAndCashEquivalentsAtCarryingValueIncludingDiscontinuedOperations"],
  longTermDebt: ["LongTermDebtNoncurrent"],
  operatingCashFlow: ["NetCashProvidedByUsedInOperatingActivities"],
  sharesOutstanding: ["CommonStockSharesOutstanding"],
  epsBasic: ["EarningsPerShareBasic"],
  dividendsPaid: ["PaymentsOfDividends"],
} as const;

type ConceptKey = keyof typeof CONCEPTS;

/** Finds the most recent annual (10-K, full fiscal year) reported value for a concept, trying each alias in order. */
function latestAnnualValue(
  facts: SecCompanyFacts,
  concept: ConceptKey,
  adapter: SecEdgarAdapter,
): { value: number; fy: number; end: string } | undefined {
  for (const conceptName of CONCEPTS[concept]) {
    const units = adapter.extractConcept(facts, conceptName, "USD");
    const annual = units.filter((u: SecFactUnit) => u.form === "10-K" && u.fp === "FY");
    if (annual.length === 0) continue;
    const latest = annual.reduce((best, cur) => (cur.end > best.end ? cur : best));
    return { value: latest.val, fy: latest.fy, end: latest.end };
  }
  return undefined;
}

function priorAnnualValue(
  facts: SecCompanyFacts,
  concept: ConceptKey,
  adapter: SecEdgarAdapter,
  currentFy: number,
): number | undefined {
  for (const conceptName of CONCEPTS[concept]) {
    const units = adapter.extractConcept(facts, conceptName, "USD");
    const priorYear = units.filter((u) => u.form === "10-K" && u.fp === "FY" && u.fy === currentFy - 1);
    if (priorYear.length > 0) return priorYear[0]!.val;
  }
  return undefined;
}

export interface FundamentalSnapshot {
  readonly instrumentId: string;
  readonly cik: string;
  readonly entityName: string;
  readonly asOfFiscalYear: number | null;
  readonly asOfDate: string | null;
  readonly ratios: {
    readonly grossMargin: number | null;
    readonly operatingMargin: number | null;
    readonly netMargin: number | null;
    readonly currentRatio: number | null;
    readonly quickRatio: number | null;
    readonly debtToEquity: number | null;
    readonly roe: number | null;
    readonly roa: number | null;
    readonly revenueYoyGrowth: number | null;
    readonly netIncomeYoyGrowth: number | null;
  };
  readonly healthScores: {
    readonly piotroski: PiotroskiResult | null;
    readonly altmanZ: AltmanZResult | null;
  };
  readonly missingConcepts: readonly string[];
  readonly disclaimer: string;
}

const FUNDAMENTAL_DISCLAIMER =
  "Computed from SEC EDGAR XBRL company-facts data, which is filed by the company itself and may contain " +
  "restatements, tagging inconsistencies, or omitted concepts. This is NOT investment advice; ratios are " +
  "informational only and every missing input is reported explicitly rather than estimated.";

export async function buildFundamentalSnapshot(
  instrumentId: string,
  adapter: SecEdgarAdapter,
): Promise<FundamentalSnapshot> {
  const cik = SEED_CIK_BY_INSTRUMENT[instrumentId];
  if (!cik) {
    throw new Error(
      `No SEC EDGAR CIK mapping known for instrument "${instrumentId}" in this milestone's seed catalogue. ` +
        `SEC EDGAR only covers US-listed filers; a full symbol-to-CIK lookup service is a follow-on milestone.`,
    );
  }

  const facts = await adapter.fetchCompanyFacts(cik);
  const missingConcepts: string[] = [];

  const get = (key: ConceptKey): number | undefined => {
    const v = latestAnnualValue(facts, key, adapter);
    if (!v) missingConcepts.push(key);
    return v?.value;
  };

  const revenue = get("revenue");
  const netIncome = get("netIncome");
  const operatingIncome = get("operatingIncome");
  const grossProfit = get("grossProfit");
  const totalAssets = get("totalAssets");
  const totalLiabilities = get("totalLiabilities");
  const totalEquity = get("totalEquity");
  const currentAssets = get("currentAssets");
  const currentLiabilities = get("currentLiabilities");
  const inventory = get("inventory");
  const longTermDebt = get("longTermDebt");
  const operatingCashFlow = get("operatingCashFlow");

  const revenueAnnual = latestAnnualValue(facts, "revenue", adapter);
  const currentFy = revenueAnnual?.fy ?? null;
  const priorRevenue = currentFy ? priorAnnualValue(facts, "revenue", adapter, currentFy) : undefined;
  const priorNetIncome = currentFy ? priorAnnualValue(facts, "netIncome", adapter, currentFy) : undefined;

  const computedRatios = {
    grossMargin: grossProfit !== undefined && revenue !== undefined ? ratios.grossMargin(grossProfit, revenue) : null,
    operatingMargin:
      operatingIncome !== undefined && revenue !== undefined ? ratios.operatingMargin(operatingIncome, revenue) : null,
    netMargin: netIncome !== undefined && revenue !== undefined ? ratios.netMargin(netIncome, revenue) : null,
    currentRatio:
      currentAssets !== undefined && currentLiabilities !== undefined
        ? ratios.currentRatio(currentAssets, currentLiabilities)
        : null,
    quickRatio:
      currentAssets !== undefined && inventory !== undefined && currentLiabilities !== undefined
        ? ratios.quickRatio(currentAssets, inventory, currentLiabilities)
        : null,
    debtToEquity: longTermDebt !== undefined && totalEquity !== undefined ? ratios.debtToEquity(longTermDebt, totalEquity) : null,
    roe: netIncome !== undefined && totalEquity !== undefined ? ratios.roe(netIncome, totalEquity) : null,
    roa: netIncome !== undefined && totalAssets !== undefined ? ratios.roa(netIncome, totalAssets) : null,
    revenueYoyGrowth: revenue !== undefined && priorRevenue !== undefined ? ratios.yoyGrowth(revenue, priorRevenue) : null,
    netIncomeYoyGrowth:
      netIncome !== undefined && priorNetIncome !== undefined ? ratios.yoyGrowth(netIncome, priorNetIncome) : null,
  };

  // Health scores require the full prior-year set; only compute if everything needed is present.
  let piotroski: PiotroskiResult | null = null;
  const priorTotalAssets = currentFy ? priorAnnualValue(facts, "totalAssets", adapter, currentFy) : undefined;
  const priorLongTermDebt = currentFy ? priorAnnualValue(facts, "longTermDebt", adapter, currentFy) : undefined;
  const priorCurrentAssets = currentFy ? priorAnnualValue(facts, "currentAssets", adapter, currentFy) : undefined;
  const priorCurrentLiabilities = currentFy ? priorAnnualValue(facts, "currentLiabilities", adapter, currentFy) : undefined;
  const priorGrossProfit = currentFy ? priorAnnualValue(facts, "grossProfit", adapter, currentFy) : undefined;
  const priorSharesOutstanding = currentFy ? priorAnnualValue(facts, "sharesOutstanding", adapter, currentFy) : undefined;
  const sharesOutstanding = get("sharesOutstanding");

  if (
    netIncome !== undefined &&
    totalAssets !== undefined &&
    priorTotalAssets !== undefined &&
    operatingCashFlow !== undefined &&
    longTermDebt !== undefined &&
    priorLongTermDebt !== undefined &&
    currentAssets !== undefined &&
    currentLiabilities !== undefined &&
    priorCurrentAssets !== undefined &&
    priorCurrentLiabilities !== undefined &&
    sharesOutstanding !== undefined &&
    priorSharesOutstanding !== undefined &&
    grossProfit !== undefined &&
    priorGrossProfit !== undefined &&
    revenue !== undefined &&
    priorRevenue !== undefined &&
    priorNetIncome !== undefined
  ) {
    piotroski = piotroskiFScore({
      roa: netIncome / totalAssets,
      priorRoa: priorNetIncome / priorTotalAssets,
      operatingCashFlow,
      netIncome,
      longTermDebt,
      priorLongTermDebt,
      totalAssets,
      priorTotalAssets,
      currentRatio: currentAssets / currentLiabilities,
      priorCurrentRatio: priorCurrentAssets / priorCurrentLiabilities,
      sharesOutstanding,
      priorSharesOutstanding,
      grossMargin: grossProfit / revenue,
      priorGrossMargin: priorGrossProfit / priorRevenue,
      revenue,
      priorRevenue,
    });
  }

  // Altman Z requires market value of equity, which this service does not fetch (that's a live quote, not a
  // filed fact) — left null here; a consuming layer with quote access can compute it and is documented as such.
  const altmanZ: AltmanZResult | null = null;

  return {
    instrumentId,
    cik,
    entityName: facts.entityName,
    asOfFiscalYear: currentFy,
    asOfDate: revenueAnnual?.end ?? null,
    ratios: computedRatios,
    healthScores: { piotroski, altmanZ },
    missingConcepts: [...new Set(missingConcepts)],
    disclaimer: FUNDAMENTAL_DISCLAIMER,
  };
}

export { ratios };
export * from "./valuation.js";
export * from "./healthScores.js";

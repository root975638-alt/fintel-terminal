/**
 * Fundamental ratio formulas — pure functions, each independently unit-tested
 * against hand-calculated values. Every function returns `null` (never NaN or
 * Infinity) when the inputs make the ratio undefined (e.g. dividing by zero
 * equity), so callers must handle the "undefined ratio" case explicitly
 * rather than displaying a nonsensical number.
 *
 * [ESTABLISHED] label applies to the FORMULAS themselves (textbook financial
 * ratios) — it does NOT mean any conclusion drawn FROM a ratio value is
 * validated; that always depends on context, industry, and comparison basis.
 */

function safeDiv(numerator: number, denominator: number): number | null {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator === 0) return null;
  return numerator / denominator;
}

// --- Valuation multiples ---

/** Price-to-Earnings = price per share / earnings per share. */
export function peRatio(pricePerShare: number, epsBasic: number): number | null {
  return safeDiv(pricePerShare, epsBasic);
}

/** Price-to-Book = price per share / book value per share. */
export function pbRatio(pricePerShare: number, bookValuePerShare: number): number | null {
  return safeDiv(pricePerShare, bookValuePerShare);
}

/** Price-to-Sales = market cap / total revenue (trailing period). */
export function psRatio(marketCap: number, revenue: number): number | null {
  return safeDiv(marketCap, revenue);
}

/** EV/EBITDA = enterprise value / EBITDA. Enterprise value = marketCap + totalDebt - cash. */
export function evToEbitda(marketCap: number, totalDebt: number, cash: number, ebitda: number): number | null {
  const enterpriseValue = marketCap + totalDebt - cash;
  return safeDiv(enterpriseValue, ebitda);
}

// --- Profitability / return ratios ---

/** Return on Equity = net income / average shareholders' equity. */
export function roe(netIncome: number, avgEquity: number): number | null {
  return safeDiv(netIncome, avgEquity);
}

/** Return on Assets = net income / average total assets. */
export function roa(netIncome: number, avgAssets: number): number | null {
  return safeDiv(netIncome, avgAssets);
}

/** Return on Invested Capital = NOPAT / invested capital (total debt + total equity - cash). */
export function roic(nopat: number, totalDebt: number, totalEquity: number, cash: number): number | null {
  const investedCapital = totalDebt + totalEquity - cash;
  return safeDiv(nopat, investedCapital);
}

export function grossMargin(grossProfit: number, revenue: number): number | null {
  return safeDiv(grossProfit, revenue);
}

export function operatingMargin(operatingIncome: number, revenue: number): number | null {
  return safeDiv(operatingIncome, revenue);
}

export function netMargin(netIncome: number, revenue: number): number | null {
  return safeDiv(netIncome, revenue);
}

// --- Liquidity / solvency ratios ---

export function currentRatio(currentAssets: number, currentLiabilities: number): number | null {
  return safeDiv(currentAssets, currentLiabilities);
}

/** Quick ratio (acid-test) = (current assets - inventory) / current liabilities. */
export function quickRatio(currentAssets: number, inventory: number, currentLiabilities: number): number | null {
  return safeDiv(currentAssets - inventory, currentLiabilities);
}

export function debtToEquity(totalDebt: number, totalEquity: number): number | null {
  return safeDiv(totalDebt, totalEquity);
}

/** Interest coverage = EBIT / interest expense. High = comfortably covers debt service. */
export function interestCoverage(ebit: number, interestExpense: number): number | null {
  return safeDiv(ebit, interestExpense);
}

// --- Cash-flow / shareholder-return ratios ---

/** FCF yield = free cash flow / market cap. */
export function fcfYield(freeCashFlow: number, marketCap: number): number | null {
  return safeDiv(freeCashFlow, marketCap);
}

/** Dividend yield = dividends per share (trailing 12mo) / current price per share. */
export function dividendYield(dividendsPerShare: number, pricePerShare: number): number | null {
  return safeDiv(dividendsPerShare, pricePerShare);
}

/** Payout ratio = total dividends paid / net income. >1 means paying out more than earned. */
export function payoutRatio(dividendsPaid: number, netIncome: number): number | null {
  return safeDiv(dividendsPaid, netIncome);
}

// --- Growth ---

/** Year-over-year growth rate: (current - previous) / |previous|. */
export function yoyGrowth(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return safeDiv(current - previous, Math.abs(previous));
}

/** Compound Annual Growth Rate over `years` periods. Requires beginning and ending values to be positive. */
export function cagr(beginningValue: number, endingValue: number, years: number): number | null {
  if (beginningValue <= 0 || endingValue <= 0 || years <= 0) return null;
  return Math.pow(endingValue / beginningValue, 1 / years) - 1;
}

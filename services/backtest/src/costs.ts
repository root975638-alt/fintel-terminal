/**
 * Cost model — spread, slippage, and commission applied to every simulated
 * entry/exit. Backtests without realistic costs systematically overstate
 * performance (spec Section 0: "fabricated backtest/performance numbers" is
 * forbidden — omitting costs is a common way backtests become dishonest even
 * without literally fabricating numbers).
 */

export interface CostModelConfig {
  /** Half-spread cost in basis points, applied against the mid price on both entry and exit. */
  readonly spreadBps: number;
  /** Additional slippage in basis points, modeling imperfect fill vs. the quoted price. */
  readonly slippageBps: number;
  /** Commission in basis points of notional, charged on both entry and exit. */
  readonly commissionBps: number;
}

/**
 * CONFIG DEFAULT — verify for your instrument/venue. These are deliberately
 * conservative (i.e., costly) defaults so backtests don't look artificially
 * good; real costs vary enormously by asset class, venue, and order type.
 */
export const DEFAULT_COST_MODEL: CostModelConfig = {
  spreadBps: 5, // 0.05%
  slippageBps: 3, // 0.03%
  commissionBps: 2, // 0.02%
};

export type TradeSide = "buy" | "sell";

/** Returns the effective fill price after spread+slippage, worse than the quoted price in the direction that hurts the trader. */
export function applyMarketImpact(quotedPrice: number, side: TradeSide, config: CostModelConfig): number {
  const impactBps = config.spreadBps + config.slippageBps;
  const impactFactor = impactBps / 10_000;
  // Buying: pay more than quoted. Selling: receive less than quoted.
  return side === "buy" ? quotedPrice * (1 + impactFactor) : quotedPrice * (1 - impactFactor);
}

/** Commission charged on a given notional value (price * quantity), in the same currency units as price. */
export function commissionCost(notional: number, config: CostModelConfig): number {
  return notional * (config.commissionBps / 10_000);
}

/** Total one-sided transaction cost (spread+slippage+commission) for a given fill, expressed as an absolute currency amount. */
export function totalOneSidedCost(quotedPrice: number, quantity: number, side: TradeSide, config: CostModelConfig): number {
  const filledPrice = applyMarketImpact(quotedPrice, side, config);
  const impactCost = Math.abs(filledPrice - quotedPrice) * quantity;
  const notional = quotedPrice * quantity;
  return impactCost + commissionCost(notional, config);
}

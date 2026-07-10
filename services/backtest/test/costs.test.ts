import { describe, expect, it } from "vitest";
import { applyMarketImpact, commissionCost, totalOneSidedCost, DEFAULT_COST_MODEL, type CostModelConfig } from "../src/costs.js";

describe("applyMarketImpact", () => {
  const config: CostModelConfig = { spreadBps: 10, slippageBps: 5, commissionBps: 0 }; // 15bps total impact

  it("makes buys more expensive than the quoted price", () => {
    const filled = applyMarketImpact(100, "buy", config);
    expect(filled).toBeCloseTo(100 * 1.0015, 10);
  });

  it("makes sells cheaper than the quoted price", () => {
    const filled = applyMarketImpact(100, "sell", config);
    expect(filled).toBeCloseTo(100 * 0.9985, 10);
  });

  it("applies zero impact when spread and slippage are both zero", () => {
    const zeroImpact: CostModelConfig = { spreadBps: 0, slippageBps: 0, commissionBps: 0 };
    expect(applyMarketImpact(100, "buy", zeroImpact)).toBe(100);
    expect(applyMarketImpact(100, "sell", zeroImpact)).toBe(100);
  });
});

describe("commissionCost", () => {
  it("computes commission as a percentage of notional", () => {
    const config: CostModelConfig = { spreadBps: 0, slippageBps: 0, commissionBps: 10 }; // 0.1%
    expect(commissionCost(10_000, config)).toBeCloseTo(10, 10);
  });
});

describe("totalOneSidedCost", () => {
  it("combines market impact and commission into a single cost figure", () => {
    const config: CostModelConfig = { spreadBps: 10, slippageBps: 0, commissionBps: 5 };
    // price=100, qty=10: impact = 100*0.001*10 = 1; commission = (100*10)*0.0005 = 0.5; total = 1.5
    const cost = totalOneSidedCost(100, 10, "buy", config);
    expect(cost).toBeCloseTo(1.5, 10);
  });

  it("is always non-negative for both buy and sell sides", () => {
    const cost1 = totalOneSidedCost(100, 5, "buy", DEFAULT_COST_MODEL);
    const cost2 = totalOneSidedCost(100, 5, "sell", DEFAULT_COST_MODEL);
    expect(cost1).toBeGreaterThan(0);
    expect(cost2).toBeGreaterThan(0);
  });
});

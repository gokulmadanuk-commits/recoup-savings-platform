import { describe, it, expect } from "vitest";
import { RevenueDatasetSchema } from "../../types";
import { ANALYSIS_DATE } from "../../../config";
import { runRevenueRules } from "../../rules/runner";
import { rl10 } from "../../rules/rl10-late-interest";
import seed from "./pinnacle-retail-group";

const dataset = RevenueDatasetSchema.parse({
  seller: "Northwind Logistics Group, Inc.",
  analysisDate: ANALYSIS_DATE,
  customers: [seed.record],
});

describe("Pinnacle Retail Group — RL10 planted (late-payment interest never charged)", () => {
  it("reproduces the answer key exactly", () => {
    const findings = runRevenueRules([rl10], dataset);
    expect(findings).toHaveLength(1);
    const f = findings[0];
    const e = seed.expected[0];
    expect(f.ruleId).toBe("RL10");
    expect(f.category).toBe("late_interest");
    // Hand-derived: $80k×0.015×2 + $50k×0.015×4 = 240,000 + 300,000 = 540,000c.
    expect(f.arrearsToDateCents).toBe(e.arrearsToDateCents);
    expect(f.annualizedUpliftCents).toBe(e.annualizedUpliftCents);
    expect(f.totalRecoverableCents).toBe(e.totalRecoverableCents);
    expect(f.relationshipRisk).toBe(e.relationshipRisk);
    expect(f.recoveryType).toBe("arrears");
  });

  it("computes the blended fee (30% arrears + 20% uplift)", () => {
    const [f] = runRevenueRules([rl10], dataset);
    const expectedFee =
      Math.round(f.arrearsToDateCents * 0.3) +
      Math.round(f.annualizedUpliftCents * 0.2);
    expect(f.estimatedFeeCents).toBe(expectedFee);
    expect(f.estimatedFeeCents).toBe(162_000); // 30% of $5,400 = $1,620
  });

  it("carries evidence and a finance-charge ask", () => {
    const [f] = runRevenueRules([rl10], dataset);
    expect(f.evidence.length).toBeGreaterThanOrEqual(3);
    expect(f.recommendedAsk).toBeTruthy();
    expect(f.clauseCited).toBeTruthy();
  });

  it("excludes the current (within-grace) row from the accrual", () => {
    const [f] = runRevenueRules([rl10], dataset);
    // The $30k current row would have added interest if (wrongly) included; the
    // accrual matches exactly the two overdue rows, proving it was excluded.
    expect(f.arrearsToDateCents).toBe(540_000);
  });

  it("does not fire when the contract carries no late-payment interest clause", () => {
    // Strip the finance-charge entitlement → no contractual basis, no finding.
    const noClause = RevenueDatasetSchema.parse({
      seller: "Northwind Logistics Group, Inc.",
      analysisDate: ANALYSIS_DATE,
      customers: [
        {
          ...seed.record,
          contract: { ...seed.record.contract, latePaymentInterestPct: null },
        },
      ],
    });
    expect(runRevenueRules([rl10], noClause)).toHaveLength(0);
  });

  it("does not fire when no balance is past due beyond the grace period", () => {
    // Re-age every AR row to within the 30-day grace → nothing accrues.
    const allCurrent = RevenueDatasetSchema.parse({
      seller: "Northwind Logistics Group, Inc.",
      analysisDate: ANALYSIS_DATE,
      customers: [
        {
          ...seed.record,
          arAging: seed.record.arAging.map((r) => ({
            ...r,
            ageDays: 10,
            bucket: "1_30" as const,
          })),
        },
      ],
    });
    expect(runRevenueRules([rl10], allCurrent)).toHaveLength(0);
  });
});

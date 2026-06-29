import { describe, it, expect } from "vitest";
import { RevenueDatasetSchema } from "../../types";
import { ANALYSIS_DATE } from "../../../config";
import { runRevenueRules } from "../../rules/runner";
import { rl04 } from "../../rules/rl04-tier-breach";
import seed from "./tidewater-wholesale-supply";

const dataset = RevenueDatasetSchema.parse({
  seller: "Northwind Logistics Group, Inc.",
  analysisDate: ANALYSIS_DATE,
  customers: [seed.record],
});

describe("Tidewater Wholesale Supply — RL04 planted (graduated-tier breach)", () => {
  it("reproduces the answer key exactly", () => {
    const findings = runRevenueRules([rl04], dataset);
    expect(findings).toHaveLength(1);
    const f = findings[0];
    const e = seed.expected[0];
    expect(f.ruleId).toBe("RL04");
    expect(f.category).toBe("tier_breach");
    expect(f.arrearsToDateCents).toBe(e.arrearsToDateCents);
    expect(f.annualizedUpliftCents).toBe(e.annualizedUpliftCents);
    expect(f.totalRecoverableCents).toBe(e.totalRecoverableCents);
    expect(f.relationshipRisk).toBe(e.relationshipRisk);
    expect(f.recoveryType).toBe("uplift");
  });

  it("computes the blended fee (30% arrears + 20% uplift)", () => {
    const [f] = runRevenueRules([rl04], dataset);
    const expectedFee =
      Math.round(f.arrearsToDateCents * 0.3) +
      Math.round(f.annualizedUpliftCents * 0.2);
    expect(f.estimatedFeeCents).toBe(expectedFee);
    expect(f.estimatedFeeCents).toBe(2_052_000); // $20,520.00 hand-derived
  });

  it("carries evidence and a corrected-invoice ask", () => {
    const [f] = runRevenueRules([rl04], dataset);
    expect(f.evidence.length).toBeGreaterThanOrEqual(3);
    expect(f.recommendedAsk).toBeTruthy();
    expect(f.clauseCited).toBeTruthy();
  });

  it("does not fire once billed on the correct graduated schedule", () => {
    // Re-bill at the correct graduated charge ($66,000/mo) → no gap, no finding.
    const corrected = RevenueDatasetSchema.parse({
      seller: "Northwind Logistics Group, Inc.",
      analysisDate: ANALYSIS_DATE,
      customers: [
        {
          ...seed.record,
          billings: seed.record.billings.map((b) => ({
            ...b,
            lines: b.lines.map((l) =>
              l.lineType === "usage"
                ? { ...l, lineTotalCents: 6_600_000 } // 4000×$12 + 1200×$15
                : l,
            ),
          })),
        },
      ],
    });
    expect(runRevenueRules([rl04], corrected)).toHaveLength(0);
  });

  it("does not fire when volume stays inside the first tier", () => {
    // Volume below the 4,000-pallet break, billed correctly at base rate → nothing.
    const underTier = RevenueDatasetSchema.parse({
      seller: "Northwind Logistics Group, Inc.",
      analysisDate: ANALYSIS_DATE,
      customers: [
        {
          ...seed.record,
          billings: seed.record.billings.map((b) => ({
            ...b,
            lines: b.lines.map((l) =>
              l.lineType === "usage"
                ? { ...l, qty: 3_500, lineTotalCents: 4_200_000 } // 3500 × $12
                : l,
            ),
          })),
        },
      ],
    });
    expect(runRevenueRules([rl04], underTier)).toHaveLength(0);
  });
});

import { describe, it, expect } from "vitest";
import { RevenueDatasetSchema } from "../../types";
import { ANALYSIS_DATE } from "../../../config";
import { runRevenueRules } from "../../rules/runner";
import { rl09 } from "../../rules/rl09-renewal-repricing";
import seed from "./northgate-distribution-centers";

const dataset = RevenueDatasetSchema.parse({
  seller: "Northwind Logistics Group, Inc.",
  analysisDate: ANALYSIS_DATE,
  customers: [seed.record],
});

describe("Northgate Distribution Centers — RL09 planted (auto-renewal repriced at the old rate)", () => {
  it("reproduces the answer key exactly", () => {
    const findings = runRevenueRules([rl09], dataset);
    expect(findings).toHaveLength(1);
    const f = findings[0];
    const e = seed.expected[0];
    expect(f.ruleId).toBe("RL09");
    expect(f.category).toBe("renewal_repricing");
    expect(f.arrearsToDateCents).toBe(e.arrearsToDateCents);
    expect(f.annualizedUpliftCents).toBe(e.annualizedUpliftCents);
    expect(f.totalRecoverableCents).toBe(e.totalRecoverableCents);
    expect(f.relationshipRisk).toBe(e.relationshipRisk);
    expect(f.recoveryType).toBe("uplift");
  });

  it("computes the blended fee (30% arrears + 20% uplift)", () => {
    const [f] = runRevenueRules([rl09], dataset);
    const expectedFee =
      Math.round(f.arrearsToDateCents * 0.3) +
      Math.round(f.annualizedUpliftCents * 0.2);
    expect(f.estimatedFeeCents).toBe(expectedFee);
    // Hand-checked: round(4,000,000 * 0.3) + round(4,800,000 * 0.2)
    //             = 1,200,000 + 960,000 = 2,160,000
    expect(f.estimatedFeeCents).toBe(2_160_000);
  });

  it("carries evidence and a renewal-repricing ask", () => {
    const [f] = runRevenueRules([rl09], dataset);
    expect(f.evidence.length).toBeGreaterThanOrEqual(3);
    expect(f.recommendedAsk).toBeTruthy();
    expect(f.clauseCited).toBeTruthy();
  });

  it("does not fire once billing is repriced to the renewal list price", () => {
    // Re-bill the recurring line at the current rate-card list ($58,000/mo) →
    // no gap, guard returns nothing.
    const LIST = 5_800_000;
    const corrected = RevenueDatasetSchema.parse({
      seller: "Northwind Logistics Group, Inc.",
      analysisDate: ANALYSIS_DATE,
      customers: [
        {
          ...seed.record,
          billings: seed.record.billings.map((b) => ({
            ...b,
            lines: b.lines.map((l) =>
              l.lineType === "recurring"
                ? { ...l, unitPriceCents: LIST, lineTotalCents: LIST }
                : l,
            ),
          })),
        },
      ],
    });
    expect(runRevenueRules([rl09], corrected)).toHaveLength(0);
  });
});

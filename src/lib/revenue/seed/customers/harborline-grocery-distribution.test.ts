import { describe, it, expect } from "vitest";
import { RevenueDatasetSchema } from "../../types";
import { ANALYSIS_DATE } from "../../../config";
import { runRevenueRules } from "../../rules/runner";
import { rl02 } from "../../rules/rl02-price-step-missed";
import seed from "./harborline-grocery-distribution";

const dataset = RevenueDatasetSchema.parse({
  seller: "Northwind Logistics Group, Inc.",
  analysisDate: ANALYSIS_DATE,
  customers: [seed.record],
});

describe("Harborline Grocery Distribution — RL02 planted (scheduled price step missed)", () => {
  it("reproduces the answer key exactly", () => {
    const findings = runRevenueRules([rl02], dataset);
    expect(findings).toHaveLength(1);
    const f = findings[0];
    const e = seed.expected[0];
    expect(f.ruleId).toBe("RL02");
    expect(f.category).toBe("price_step_missed");
    expect(f.arrearsToDateCents).toBe(e.arrearsToDateCents);
    expect(f.annualizedUpliftCents).toBe(e.annualizedUpliftCents);
    expect(f.totalRecoverableCents).toBe(e.totalRecoverableCents);
    expect(f.relationshipRisk).toBe(e.relationshipRisk);
    expect(f.recoveryType).toBe("uplift");
  });

  it("computes the blended fee (30% arrears + 20% uplift)", () => {
    const [f] = runRevenueRules([rl02], dataset);
    const expectedFee =
      Math.round(f.arrearsToDateCents * 0.3) +
      Math.round(f.annualizedUpliftCents * 0.2);
    expect(f.estimatedFeeCents).toBe(expectedFee);
    // Hand-derived: round(3,600,000*0.3) + round(4,800,000*0.2) = 1,080,000 + 960,000.
    expect(f.estimatedFeeCents).toBe(2_040_000);
  });

  it("carries evidence and a corrected-invoice ask", () => {
    const [f] = runRevenueRules([rl02], dataset);
    expect(f.evidence.length).toBeGreaterThanOrEqual(3);
    expect(f.recommendedAsk).toBeTruthy();
    expect(f.clauseCited).toBeTruthy();
  });

  it("does not fire once the price step is correctly applied", () => {
    // Re-bill the post-step months at the stepped $56,000/mo → no shortfall.
    const corrected = RevenueDatasetSchema.parse({
      seller: "Northwind Logistics Group, Inc.",
      analysisDate: ANALYSIS_DATE,
      customers: [
        {
          ...seed.record,
          billings: seed.record.billings.map((b) =>
            b.invoiceDate >= "2025-10-01"
              ? {
                  ...b,
                  lines: b.lines.map((l) =>
                    l.lineType === "recurring"
                      ? { ...l, unitPriceCents: 5_600_000, lineTotalCents: 5_600_000 }
                      : l,
                  ),
                }
              : b,
          ),
        },
      ],
    });
    expect(runRevenueRules([rl02], corrected)).toHaveLength(0);
  });
});

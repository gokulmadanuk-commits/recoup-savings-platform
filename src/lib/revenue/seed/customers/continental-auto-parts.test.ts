import { describe, it, expect } from "vitest";
import { RevenueDatasetSchema } from "../../types";
import { ANALYSIS_DATE } from "../../../config";
import { runRevenueRules } from "../../rules/runner";
import { rl07 } from "../../rules/rl07-missing-surcharge";
import seed from "./continental-auto-parts";

const dataset = RevenueDatasetSchema.parse({
  seller: "Northwind Logistics Group, Inc.",
  analysisDate: ANALYSIS_DATE,
  customers: [seed.record],
});

describe("Continental Auto Parts — RL07 planted (fuel surcharge never billed)", () => {
  it("reproduces the answer key exactly", () => {
    const findings = runRevenueRules([rl07], dataset);
    expect(findings).toHaveLength(1);
    const f = findings[0];
    const e = seed.expected[0];
    expect(f.ruleId).toBe("RL07");
    expect(f.category).toBe("missing_surcharge");
    // arrears = 12 × round($44,000 × 0.085) = 12 × $3,740 = $44,880.00
    expect(f.arrearsToDateCents).toBe(e.arrearsToDateCents);
    // uplift = $3,740/mo × 12 = $44,880.00
    expect(f.annualizedUpliftCents).toBe(e.annualizedUpliftCents);
    expect(f.totalRecoverableCents).toBe(e.totalRecoverableCents);
    expect(f.relationshipRisk).toBe(e.relationshipRisk);
    expect(f.recoveryType).toBe("arrears");
  });

  it("computes the blended fee (30% arrears + 20% uplift)", () => {
    const [f] = runRevenueRules([rl07], dataset);
    const expectedFee =
      Math.round(f.arrearsToDateCents * 0.3) +
      Math.round(f.annualizedUpliftCents * 0.2);
    // = round(4,488,000 × 0.3) + round(4,488,000 × 0.2) = 1,346,400 + 897,600 = 2,244,000
    expect(f.estimatedFeeCents).toBe(expectedFee);
    expect(f.estimatedFeeCents).toBe(2_244_000);
  });

  it("carries evidence and a corrected-invoice ask", () => {
    const [f] = runRevenueRules([rl07], dataset);
    expect(f.evidence.length).toBeGreaterThanOrEqual(3);
    expect(f.recommendedAsk).toBeTruthy();
    expect(f.clauseCited).toBeTruthy();
  });

  it("does not fire once the surcharge line is actually billed", () => {
    // Add the contractual fuel surcharge line to every billing → no leak.
    const corrected = RevenueDatasetSchema.parse({
      seller: "Northwind Logistics Group, Inc.",
      analysisDate: ANALYSIS_DATE,
      customers: [
        {
          ...seed.record,
          billings: seed.record.billings.map((b) => ({
            ...b,
            lines: [
              ...b.lines,
              {
                sku: "FUEL-SUR",
                description: "Fuel surcharge — 8.5% (EIA on-highway diesel)",
                uom: "each",
                qty: 1,
                unitPriceCents: 374_000,
                lineTotalCents: 374_000,
                lineType: "surcharge",
                workOrderId: null,
                assetId: null,
                periodStart: null,
                periodEnd: null,
                serviceDate: null,
              },
            ],
          })),
        },
      ],
    });
    expect(runRevenueRules([rl07], corrected)).toHaveLength(0);
  });
});

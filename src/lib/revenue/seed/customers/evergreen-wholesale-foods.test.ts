import { describe, it, expect } from "vitest";
import { RevenueDatasetSchema } from "../../types";
import { ANALYSIS_DATE } from "../../../config";
import { runRevenueRules } from "../../rules/runner";
import { rl11 } from "../../rules/rl11-rebate-over-credit";
import seed from "./evergreen-wholesale-foods";

const dataset = RevenueDatasetSchema.parse({
  seller: "Northwind Logistics Group, Inc.",
  analysisDate: ANALYSIS_DATE,
  customers: [seed.record],
});

describe("Evergreen Wholesale Foods — RL11 planted (rebate over-credited)", () => {
  it("reproduces the answer key exactly", () => {
    const findings = runRevenueRules([rl11], dataset);
    expect(findings).toHaveLength(1);
    const f = findings[0];
    const e = seed.expected[0];
    expect(f.ruleId).toBe("RL11");
    expect(f.category).toBe("rebate_over_credit");
    // Hand-derived: 12 × ($4,000 − $2,500) = $18,000 arrears; $1,500 × 12 = $18,000 uplift.
    expect(f.arrearsToDateCents).toBe(e.arrearsToDateCents);
    expect(f.annualizedUpliftCents).toBe(e.annualizedUpliftCents);
    expect(f.totalRecoverableCents).toBe(e.totalRecoverableCents);
    expect(f.relationshipRisk).toBe(e.relationshipRisk);
    expect(f.recoveryType).toBe(e.recoveryType);
  });

  it("computes the blended fee (30% arrears + 20% uplift)", () => {
    const [f] = runRevenueRules([rl11], dataset);
    const expectedFee =
      Math.round(f.arrearsToDateCents * 0.3) +
      Math.round(f.annualizedUpliftCents * 0.2);
    expect(f.estimatedFeeCents).toBe(expectedFee);
  });

  it("carries evidence and a corrected-rebate ask", () => {
    const [f] = runRevenueRules([rl11], dataset);
    expect(f.evidence.length).toBeGreaterThanOrEqual(3);
    expect(f.recommendedAsk).toBeTruthy();
    expect(f.clauseCited).toBeTruthy();
  });

  it("does not fire once credits are within the contracted 5%", () => {
    // Re-bill the rebate at the correct −$2,500/mo (5% of $50,000) → no excess.
    const corrected = RevenueDatasetSchema.parse({
      seller: "Northwind Logistics Group, Inc.",
      analysisDate: ANALYSIS_DATE,
      customers: [
        {
          ...seed.record,
          billings: seed.record.billings.map((b) => ({
            ...b,
            lines: b.lines.map((l) =>
              l.lineType === "discount"
                ? { ...l, unitPriceCents: -250_000, lineTotalCents: -250_000 }
                : l,
            ),
          })),
        },
      ],
    });
    expect(runRevenueRules([rl11], corrected)).toHaveLength(0);
  });
});

import { describe, it, expect } from "vitest";
import { RevenueDatasetSchema } from "../../types";
import { ANALYSIS_DATE } from "../../../config";
import { runRevenueRules } from "../../rules/runner";
import { rl03 } from "../../rules/rl03-expired-discount";
import seed from "./brightline-grocers";

const dataset = RevenueDatasetSchema.parse({
  seller: "Northwind Logistics Group, Inc.",
  analysisDate: ANALYSIS_DATE,
  customers: [seed.record],
});

describe("Brightline Grocers — RL03 planted (expired discount still applied)", () => {
  it("reproduces the answer key exactly", () => {
    const findings = runRevenueRules([rl03], dataset);
    expect(findings).toHaveLength(1);
    const f = findings[0];
    const e = seed.expected[0];
    expect(f.ruleId).toBe("RL03");
    expect(f.category).toBe("expired_discount");
    expect(f.arrearsToDateCents).toBe(e.arrearsToDateCents);
    expect(f.annualizedUpliftCents).toBe(e.annualizedUpliftCents);
    expect(f.totalRecoverableCents).toBe(e.totalRecoverableCents);
    expect(f.relationshipRisk).toBe(e.relationshipRisk);
    expect(f.recoveryType).toBe("uplift");
  });

  it("computes the blended fee (30% arrears + 20% uplift)", () => {
    const [f] = runRevenueRules([rl03], dataset);
    const expectedFee =
      Math.round(f.arrearsToDateCents * 0.3) +
      Math.round(f.annualizedUpliftCents * 0.2);
    expect(f.estimatedFeeCents).toBe(expectedFee);
    // Hand check: round(4_050_000*0.3)=1_215_000 + round(5_400_000*0.2)=1_080_000.
    expect(f.estimatedFeeCents).toBe(2_295_000);
  });

  it("carries evidence and a corrected-invoice ask", () => {
    const [f] = runRevenueRules([rl03], dataset);
    expect(f.evidence.length).toBeGreaterThanOrEqual(3);
    expect(f.recommendedAsk).toBeTruthy();
    expect(f.clauseCited).toBeTruthy();
  });

  it("does not fire once the discount is correctly removed post-expiry", () => {
    // Re-bill at the gross list price (drop every discount line) → no finding.
    const corrected = RevenueDatasetSchema.parse({
      seller: "Northwind Logistics Group, Inc.",
      analysisDate: ANALYSIS_DATE,
      customers: [
        {
          ...seed.record,
          billings: seed.record.billings.map((b) => ({
            ...b,
            lines: b.lines.filter((l) => l.lineType !== "discount"),
          })),
        },
      ],
    });
    expect(runRevenueRules([rl03], corrected)).toHaveLength(0);
  });
});

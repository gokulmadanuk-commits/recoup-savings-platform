import { describe, it, expect } from "vitest";
import { RevenueDatasetSchema } from "../../types";
import { ANALYSIS_DATE } from "../../../config";
import { runRevenueRules } from "../../rules/runner";
import { rl06 } from "../../rules/rl06-min-commit-shortfall";
import seed from "./lakeshore-foods-coop";

const dataset = RevenueDatasetSchema.parse({
  seller: "Northwind Logistics Group, Inc.",
  analysisDate: ANALYSIS_DATE,
  customers: [seed.record],
});

describe("Lakeshore Foods Co-op — RL06 planted (take-or-pay shortfall never invoiced)", () => {
  it("reproduces the answer key exactly", () => {
    const findings = runRevenueRules([rl06], dataset);
    expect(findings).toHaveLength(1);
    const f = findings[0];
    const e = seed.expected[0];
    expect(f.ruleId).toBe("RL06");
    expect(f.category).toBe("min_commit_shortfall");
    expect(f.arrearsToDateCents).toBe(e.arrearsToDateCents); // $90,000.00
    expect(f.annualizedUpliftCents).toBe(e.annualizedUpliftCents); // 0
    expect(f.totalRecoverableCents).toBe(e.totalRecoverableCents); // $90,000.00
    expect(f.relationshipRisk).toBe(e.relationshipRisk); // A
    expect(f.recoveryType).toBe("arrears");
  });

  it("computes the blended fee (30% arrears + 20% uplift)", () => {
    const [f] = runRevenueRules([rl06], dataset);
    const expectedFee =
      Math.round(f.arrearsToDateCents * 0.3) +
      Math.round(f.annualizedUpliftCents * 0.2);
    expect(f.estimatedFeeCents).toBe(expectedFee); // 2,700,000c
  });

  it("carries evidence and a true-up ask", () => {
    const [f] = runRevenueRules([rl06], dataset);
    expect(f.evidence.length).toBeGreaterThanOrEqual(3);
    expect(f.recommendedAsk).toBeTruthy();
    expect(f.clauseCited).toBeTruthy();
  });

  it("does not fire once the minimum is met", () => {
    // Re-bill at $50,000/mo → trailing-12 billed = $600,000 = the floor → no shortfall.
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
                ? { ...l, unitPriceCents: 5_000_000, lineTotalCents: 5_000_000 }
                : l,
            ),
          })),
        },
      ],
    });
    expect(runRevenueRules([rl06], corrected)).toHaveLength(0);
  });
});

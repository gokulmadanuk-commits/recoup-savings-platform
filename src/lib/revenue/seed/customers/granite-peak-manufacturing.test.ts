import { describe, it, expect } from "vitest";
import { RevenueDatasetSchema } from "../../types";
import { ANALYSIS_DATE } from "../../../config";
import { runRevenueRules } from "../../rules/runner";
import { rl05 } from "../../rules/rl05-unbilled-overage";
import seed from "./granite-peak-manufacturing";

const dataset = RevenueDatasetSchema.parse({
  seller: "Northwind Logistics Group, Inc.",
  analysisDate: ANALYSIS_DATE,
  customers: [seed.record],
});

describe("Granite Peak Manufacturing — RL05 planted (unbilled overage above allowance)", () => {
  it("reproduces the answer key exactly", () => {
    const findings = runRevenueRules([rl05], dataset);
    expect(findings).toHaveLength(1);
    const f = findings[0];
    const e = seed.expected[0];
    expect(f.ruleId).toBe("RL05");
    expect(f.category).toBe("unbilled_usage");
    // Hand arithmetic: 12 months × (9,500 − 8,000) cu-ft × $2.00 = $36,000.00 arrears;
    // 1,500 cu-ft × $2.00 × 12 = $36,000.00 uplift; total $72,000.00.
    expect(f.arrearsToDateCents).toBe(e.arrearsToDateCents);
    expect(f.annualizedUpliftCents).toBe(e.annualizedUpliftCents);
    expect(f.totalRecoverableCents).toBe(e.totalRecoverableCents);
    expect(f.relationshipRisk).toBe(e.relationshipRisk);
    expect(f.recoveryType).toBe("arrears");
  });

  it("computes the blended fee (30% arrears + 20% uplift)", () => {
    const [f] = runRevenueRules([rl05], dataset);
    const expectedFee =
      Math.round(f.arrearsToDateCents * 0.3) +
      Math.round(f.annualizedUpliftCents * 0.2);
    expect(f.estimatedFeeCents).toBe(expectedFee);
  });

  it("carries evidence and a corrected-invoice ask", () => {
    const [f] = runRevenueRules([rl05], dataset);
    expect(f.evidence.length).toBeGreaterThanOrEqual(3);
    expect(f.recommendedAsk).toBeTruthy();
    expect(f.clauseCited).toBeTruthy();
  });

  it("does not fire once the overage is correctly billed", () => {
    // Re-bill: add an overage line for the full 1,500 cu-ft excess at $2.00
    // ($3,000/mo) → shortfall zero, no finding.
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
                sku: "BOND-OVG",
                description: "Bonded storage overage — per cu-ft above allowance",
                uom: "cu-ft",
                qty: 1_500,
                unitPriceCents: 200,
                lineTotalCents: 300_000,
                lineType: "overage" as const,
              },
            ],
          })),
        },
      ],
    });
    expect(runRevenueRules([rl05], corrected)).toHaveLength(0);
  });

  it("does not fire when metered usage is within the allowance", () => {
    // Usage at exactly 8,000 cu-ft → no excess, no finding.
    const withinAllowance = RevenueDatasetSchema.parse({
      seller: "Northwind Logistics Group, Inc.",
      analysisDate: ANALYSIS_DATE,
      customers: [
        {
          ...seed.record,
          billings: seed.record.billings.map((b) => ({
            ...b,
            lines: b.lines.map((l) =>
              l.lineType === "usage" ? { ...l, qty: 8_000 } : l,
            ),
          })),
        },
      ],
    });
    expect(runRevenueRules([rl05], withinAllowance)).toHaveLength(0);
  });
});

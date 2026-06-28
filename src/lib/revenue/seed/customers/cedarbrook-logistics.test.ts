import { describe, it, expect } from "vitest";
import { RevenueDatasetSchema } from "../../types";
import { ANALYSIS_DATE } from "../../../config";
import { runRevenueRules } from "../../rules/runner";
import { rl08 } from "../../rules/rl08-unbilled-services";
import seed from "./cedarbrook-logistics";

const dataset = RevenueDatasetSchema.parse({
  seller: "Northwind Logistics Group, Inc.",
  analysisDate: ANALYSIS_DATE,
  customers: [seed.record],
});

describe("Cedarbrook Logistics Partners — RL08 planted (delivered services never billed)", () => {
  it("reproduces the answer key exactly", () => {
    const findings = runRevenueRules([rl08], dataset);
    expect(findings).toHaveLength(1);
    const f = findings[0];
    const e = seed.expected[0];
    expect(f.ruleId).toBe("RL08");
    expect(f.category).toBe("unbilled_services");
    // 6 unbilled delivered jobs × $2,500 = $15,000.00; the 2 invoiced jobs are excluded.
    expect(f.arrearsToDateCents).toBe(e.arrearsToDateCents); // 1_500_000
    expect(f.annualizedUpliftCents).toBe(e.annualizedUpliftCents); // 0
    expect(f.totalRecoverableCents).toBe(e.totalRecoverableCents); // 1_500_000
    expect(f.relationshipRisk).toBe(e.relationshipRisk); // "A"
    expect(f.recoveryType).toBe("arrears");
  });

  it("computes the blended fee (30% arrears + 20% uplift)", () => {
    const [f] = runRevenueRules([rl08], dataset);
    const expectedFee =
      Math.round(f.arrearsToDateCents * 0.3) +
      Math.round(f.annualizedUpliftCents * 0.2);
    expect(f.estimatedFeeCents).toBe(expectedFee); // 450_000
    expect(f.estimatedFeeCents).toBe(450_000);
  });

  it("carries evidence and a corrected-invoice ask", () => {
    const [f] = runRevenueRules([rl08], dataset);
    expect(f.evidence.length).toBeGreaterThanOrEqual(3);
    expect(f.recommendedAsk).toBeTruthy();
    expect(f.clauseCited).toBeTruthy();
  });

  it("does not fire once every delivered work order is billed", () => {
    // Add a billing line referencing each unbilled work order → fully billed,
    // no orphan delivered jobs, no finding.
    const unbilledWoIds = seed.record.workOrders
      .filter((w) => w.status === "delivered")
      .map((w) => w.workOrderId);

    const corrected = RevenueDatasetSchema.parse({
      seller: "Northwind Logistics Group, Inc.",
      analysisDate: ANALYSIS_DATE,
      customers: [
        {
          ...seed.record,
          billings: [
            ...seed.record.billings,
            // One catch-up billing doc that references every previously-unbilled WO.
            {
              ...seed.record.billings[0],
              id: "NW-CED-2026-CATCHUP",
              billingNumber: "NW-CED-2026-CATCHUP",
              lines: unbilledWoIds.map((woId) => ({
                sku: "SPC-HANDLE",
                description: "Special-handling / expedited freight job (catch-up)",
                uom: "job",
                qty: 1,
                unitPriceCents: 250_000,
                lineTotalCents: 250_000,
                lineType: "service",
                workOrderId: woId,
                assetId: null,
                periodStart: null,
                periodEnd: null,
                serviceDate: null,
              })),
            },
          ],
        },
      ],
    });
    expect(runRevenueRules([rl08], corrected)).toHaveLength(0);
  });
});

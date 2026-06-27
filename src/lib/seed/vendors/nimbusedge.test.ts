import { describe, it, expect } from "vitest";
import seed from "./nimbusedge";
import { COMPANY } from "../helpers";
import { vendorRecordToDocModels } from "../../docmodel/to-docmodel";
import { assembleDataset } from "../../docmodel/from-docmodel";

const { record, expected } = seed;

describe("NimbusEdge CDN seed", () => {
  it("has a contract and >= 12 invoices", () => {
    expect(record.contract).not.toBeNull();
    expect(record.invoices.length).toBeGreaterThanOrEqual(12);
  });

  it("every invoice has internally consistent totals", () => {
    for (const inv of record.invoices) {
      const nonTax = inv.lines
        .filter((l) => l.lineType !== "tax")
        .reduce((a, l) => a + l.lineTotalCents, 0);
      expect(nonTax).toBe(inv.subtotalCents);
      expect(inv.subtotalCents + inv.taxCents).toBe(inv.totalCents);
    }
  });

  it("round-trips losslessly through the docmodel", () => {
    const assembled = assembleDataset(
      vendorRecordToDocModels(record),
      COMPANY.name,
      "2026-06-27",
    );
    expect(assembled.vendors[0]).toEqual(record);
  });

  it("has volume tiers and bills egress at the standard (un-earned) rate", () => {
    expect(record.contract!.tiers.length).toBe(2);
    expect(record.contract!.tiers[1].unitPriceCents).toBe(8); // earned $0.08
    const egress = record.invoices[0].lines.find((l) => l.description.startsWith("Egress"))!;
    expect(egress.unitPriceCents).toBe(9); // billed $0.09
    expect(egress.qty).toBe(106_667);
  });

  it("expected findings are positive and match engineered literals", () => {
    expect(expected).toHaveLength(1);
    const r07 = expected.find((e) => e.ruleId === "R07")!;
    expect(r07.annualizedSavingsCents).toBeGreaterThan(0);
    // ($0.09 - $0.08) * 1,280,004 GB = 1,280,004 cents = $12,800.04
    expect(r07.annualizedSavingsCents).toBe(1_280_004);
    expect(r07.recoverableToDateCents).toBe(1_280_004);
  });
});

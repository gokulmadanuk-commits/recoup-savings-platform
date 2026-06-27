import { describe, it, expect } from "vitest";
import seed from "./keystone-mutual-insurance";
import { COMPANY } from "../helpers";
import { vendorRecordToDocModels } from "../../docmodel/to-docmodel";
import { assembleDataset } from "../../docmodel/from-docmodel";

const { record, expected } = seed;

describe("Keystone Mutual Insurance seed", () => {
  it("has a contract and at least 12 invoices", () => {
    expect(record.contract).not.toBeNull();
    expect(record.invoices.length).toBeGreaterThanOrEqual(12);
  });

  it("every invoice's line totals reconcile to subtotal and total", () => {
    for (const inv of record.invoices) {
      const nonTax = inv.lines
        .filter((l) => l.lineType !== "tax")
        .reduce((a, l) => a + l.lineTotalCents, 0);
      expect(nonTax).toBe(inv.subtotalCents);
      expect(inv.subtotalCents + inv.taxCents).toBe(inv.totalCents);
    }
  });

  it("round-trips losslessly through the document model", () => {
    const docs = vendorRecordToDocModels(record);
    const ds = assembleDataset(docs, COMPANY.name, "2026-06-27");
    expect(ds.vendors[0]).toEqual(record);
  });

  it("expected findings have positive, engineered savings", () => {
    for (const f of expected) {
      expect(f.annualizedSavingsCents).toBeGreaterThan(0);
    }
    const r04 = expected.find((f) => f.ruleId === "R04")!;
    expect(r04.annualizedSavingsCents).toBe(26_400_00);
  });
});

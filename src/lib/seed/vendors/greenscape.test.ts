import { describe, it, expect } from "vitest";
import seed from "./greenscape";
import { COMPANY } from "../helpers";
import { vendorRecordToDocModels } from "../../docmodel/to-docmodel";
import { assembleDataset } from "../../docmodel/from-docmodel";

const { record, expected } = seed;

describe("GreenScape Grounds seed", () => {
  it("has a contract and >= 12 invoices", () => {
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

  it("round-trips losslessly through the docmodel", () => {
    const assembled = assembleDataset(
      vendorRecordToDocModels(record),
      COMPANY.name,
      "2026-06-27",
    );
    expect(assembled.vendors[0]).toEqual(record);
  });

  it("expected findings carry the engineered dollar figures", () => {
    expect(expected.length).toBeGreaterThan(0);
    for (const f of expected) {
      expect(f.annualizedSavingsCents).toBeGreaterThan(0);
    }
    const r12 = expected.find((f) => f.ruleId === "R12")!;
    expect(r12.annualizedSavingsCents).toBe(640_000); // $6,400.00
    expect(r12.recoverableToDateCents).toBe(640_000);
  });
});

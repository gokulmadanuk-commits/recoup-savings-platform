import { describe, it, expect } from "vitest";
import seed from "./meridian";
import { COMPANY } from "../helpers";
import { vendorRecordToDocModels } from "../../docmodel/to-docmodel";
import { assembleDataset } from "../../docmodel/from-docmodel";

const { record, expected } = seed;

describe("Meridian Telecom seed", () => {
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

  it("round-trips losslessly through the DocModel", () => {
    const ds = assembleDataset(
      vendorRecordToDocModels(record),
      COMPANY.name,
      "2026-06-27",
    );
    expect(ds.vendors[0]).toEqual(record);
  });

  it("planted findings carry the engineered dollar figures", () => {
    expect(expected.length).toBe(1);
    for (const f of expected) {
      expect(f.annualizedSavingsCents).toBeGreaterThan(0);
    }
    const r11 = expected.find((f) => f.ruleId === "R11")!;
    expect(r11.annualizedSavingsCents).toBe(1_500_000);
    expect(r11.recoverableToDateCents).toBe(1_500_000);
  });
});

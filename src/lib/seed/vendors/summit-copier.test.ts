import { describe, it, expect } from "vitest";
import seed from "./summit-copier";
import { vendorRecordToDocModels } from "../../docmodel/to-docmodel";
import { assembleDataset } from "../../docmodel/from-docmodel";
import { COMPANY } from "../helpers";

const { record, expected } = seed;

describe("Summit Copier Leasing seed", () => {
  it("has a contract and at least 12 invoices", () => {
    expect(record.contract).not.toBeNull();
    expect(record.invoices.length).toBeGreaterThanOrEqual(12);
  });

  it("every invoice reconciles lines to subtotal and total", () => {
    for (const inv of record.invoices) {
      const nonTax = inv.lines
        .filter((l) => l.lineType !== "tax")
        .reduce((a, l) => a + l.lineTotalCents, 0);
      expect(inv.subtotalCents, `${inv.invoiceNumber} subtotal`).toBe(nonTax);
      expect(inv.totalCents, `${inv.invoiceNumber} total`).toBe(
        inv.subtotalCents + inv.taxCents,
      );
    }
  });

  it("round-trips losslessly through the document layer", () => {
    const rebuilt = assembleDataset(
      vendorRecordToDocModels(record),
      COMPANY.name,
      "2026-06-27",
    );
    expect(rebuilt.vendors[0]).toEqual(record);
  });

  it("has 2 returned ghost units in the asset inventory", () => {
    const returned = record.usage.filter(
      (u) => u.kind === "unit" && u.status === "returned",
    );
    expect(returned.length).toBe(2);
  });

  it("expected findings carry the engineered positive savings", () => {
    for (const e of expected) expect(e.annualizedSavingsCents).toBeGreaterThan(0);
    const r02 = expected.find((e) => e.ruleId === "R02");
    const r11 = expected.find((e) => e.ruleId === "R11");
    expect(r02?.annualizedSavingsCents).toBe(960_000);
    expect(r11?.annualizedSavingsCents).toBe(684_000);
  });
});

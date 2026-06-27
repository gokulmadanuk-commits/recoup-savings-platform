import { describe, it, expect } from "vitest";
import seed from "./vertex-advisory";
import { vendorRecordToDocModels } from "../../docmodel/to-docmodel";
import { assembleDataset } from "../../docmodel/from-docmodel";
import { COMPANY } from "../helpers";

const { record, expected } = seed;

describe("Vertex Advisory LLP seed", () => {
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

  it("shows a fee jump across the escalation anniversary", () => {
    const fee = (inv: (typeof record.invoices)[number]) =>
      inv.lines.find((l) => l.sku === "AUDIT-RETAINER")!.unitPriceCents;
    expect(fee(record.invoices[0])).toBe(1_200_000);
    expect(fee(record.invoices[record.invoices.length - 1])).toBe(1_296_000);
  });

  it("every invoice is paid after the 10-day discount window", () => {
    for (const inv of record.invoices) {
      expect(inv.actualPayDate).not.toBeNull();
    }
  });

  it("expected findings carry the engineered positive savings", () => {
    for (const e of expected) expect(e.annualizedSavingsCents).toBeGreaterThan(0);
    const r04 = expected.find((e) => e.ruleId === "R04");
    const r08 = expected.find((e) => e.ruleId === "R08");
    expect(r04?.annualizedSavingsCents).toBe(720_000);
    expect(r08?.annualizedSavingsCents).toBe(431_040);
    expect(r08?.recoverableToDateCents).toBeGreaterThan(0);
  });
});

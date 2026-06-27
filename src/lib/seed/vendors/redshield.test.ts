import { describe, it, expect } from "vitest";
import seed from "./redshield";
import { vendorRecordToDocModels } from "../../docmodel/to-docmodel";
import { assembleDataset } from "../../docmodel/from-docmodel";
import { COMPANY } from "../helpers";

const { record, expected } = seed;

describe("RedShield Cyber seed", () => {
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

  it("carries the exact MDR overlap capability tag", () => {
    expect(record.contract?.capabilityTags).toContain(
      "Managed Detection & Response (MDR)",
    );
  });

  it("expected findings carry the engineered positive savings", () => {
    for (const e of expected) expect(e.annualizedSavingsCents).toBeGreaterThan(0);
    const r13 = expected.find((e) => e.ruleId === "R13");
    expect(r13?.annualizedSavingsCents).toBe(2_799_996);
  });
});

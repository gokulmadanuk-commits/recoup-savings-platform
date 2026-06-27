import { describe, it, expect } from "vitest";
import seed from "./vaultsign";
import { COMPANY } from "../helpers";
import { vendorRecordToDocModels } from "../../docmodel/to-docmodel";
import { assembleDataset } from "../../docmodel/from-docmodel";

const { record, expected } = seed;

describe("VaultSign eSignature seed", () => {
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

  it("bills 650 envelopes over the 500 allowance at the overage rate", () => {
    expect(record.contract!.commitment!.includedAllowance).toBe(500);
    const ovg = record.invoices[0].lines.find((l) => l.lineType === "overage")!;
    expect(ovg.qty).toBe(650);
    expect(ovg.unitPriceCents).toBe(200); // $2.00
  });

  it("expected findings are positive and match engineered literals", () => {
    expect(expected).toHaveLength(1);
    const r05 = expected.find((e) => e.ruleId === "R05")!;
    expect(r05.annualizedSavingsCents).toBeGreaterThan(0);
    expect(r05.annualizedSavingsCents).toBe(1_140_000); // $11,400
  });
});

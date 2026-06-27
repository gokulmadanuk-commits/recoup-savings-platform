import { describe, it, expect } from "vitest";
import seed from "./swiftparcel";
import { COMPANY } from "../helpers";
import { vendorRecordToDocModels } from "../../docmodel/to-docmodel";
import { assembleDataset } from "../../docmodel/from-docmodel";

const { record, expected } = seed;

describe("SwiftParcel Express seed", () => {
  it("has a contract and >= 12 invoices", () => {
    expect(record.contract).not.toBeNull();
    expect(record.invoices.length).toBeGreaterThanOrEqual(12);
  });

  it("spans the anniversary with a visible YoY base-charge jump", () => {
    const base = (n: number) =>
      record.invoices[n].lines.find((l) => l.sku === "GRI-BASE")!.unitPriceCents;
    // May 2025 (index 0) vs May 2026 (index 12): same month, consecutive years.
    expect(base(0)).toBe(11_200_000); // $112,000
    expect(base(12)).toBe(12_040_000); // $120,400 = +7.5%
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
    const r04 = expected.find((f) => f.ruleId === "R04")!;
    expect(r04.annualizedSavingsCents).toBe(2_150_400); // $21,504/yr
    expect(r04.recoverableToDateCents).toBe(358_400); // $3,584 to date
  });
});

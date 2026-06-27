import { describe, it, expect } from "vitest";
import { seedDataset, EXPECTED, SEEDS } from "./index";
import { vendorRecordToDocModels } from "../docmodel/to-docmodel";
import { assembleDataset } from "../docmodel/from-docmodel";
import { ANALYSIS_DATE } from "../config";
import { COMPANY } from "./helpers";

describe("seed corpus integrity", () => {
  const dataset = seedDataset();

  it("validates and has a contract per vendor", () => {
    expect(dataset.vendors.length).toBeGreaterThan(0);
    for (const v of dataset.vendors) {
      expect(v.contract, `${v.vendor.name} has a contract`).not.toBeNull();
      expect(v.invoices.length, `${v.vendor.name} has invoices`).toBeGreaterThan(0);
    }
  });

  it("every invoice's line items reconcile to its totals", () => {
    for (const v of dataset.vendors) {
      for (const inv of v.invoices) {
        const nonTax = inv.lines
          .filter((l) => l.lineType !== "tax")
          .reduce((a, l) => a + l.lineTotalCents, 0);
        expect(inv.subtotalCents, `${inv.invoiceNumber} subtotal`).toBe(nonTax);
        expect(inv.totalCents, `${inv.invoiceNumber} total`).toBe(
          inv.subtotalCents + inv.taxCents,
        );
      }
    }
  });

  it("each vendor round-trips through the document layer unchanged", () => {
    for (const v of dataset.vendors) {
      const docs = vendorRecordToDocModels(v);
      const rebuilt = assembleDataset(docs, COMPANY.name, ANALYSIS_DATE);
      expect(rebuilt.vendors[0], `${v.vendor.name} round-trip`).toEqual(v);
    }
  });

  it("answer-key entries reference real vendors and carry positive savings", () => {
    const ids = new Set(dataset.vendors.map((v) => v.vendor.id));
    for (const e of EXPECTED) {
      expect(ids.has(e.vendorId), `${e.vendorId} exists`).toBe(true);
      expect(e.annualizedSavingsCents).toBeGreaterThan(0);
    }
    expect(EXPECTED.length).toBe(SEEDS.flatMap((s) => s.expected).length);
  });

  it("Brightseat R02 overcharge is exactly $8,640/yr", () => {
    const r02 = EXPECTED.find((e) => e.vendorId === "brightseat-crm" && e.ruleId === "R02");
    expect(r02?.annualizedSavingsCents).toBe(864_000);
  });

  it("CollabHub R03 idle-seat cost is exactly $48,600/yr", () => {
    const r03 = EXPECTED.find((e) => e.vendorId === "collabhub-suite" && e.ruleId === "R03");
    expect(r03?.annualizedSavingsCents).toBe(4_860_000);
  });
});

import { describe, it, expect } from "vitest";
import seed from "./atlascloud";
import { COMPANY } from "../helpers";
import { vendorRecordToDocModels } from "../../docmodel/to-docmodel";
import { assembleDataset } from "../../docmodel/from-docmodel";

const { record, expected } = seed;

describe("AtlasCloud (IaaS) seed", () => {
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

  it("commits $480K/yr but consumes $360K/yr", () => {
    expect(record.contract!.commitment!.minCommitSpendCents).toBe(48_000_000);
    expect(record.contract!.commitment!.measurementPeriod).toBe("annual");
    const annualConsumption = record.invoices.reduce((a, inv) => a + inv.totalCents, 0);
    expect(annualConsumption).toBe(36_000_000); // $360,000
  });

  it("carries the exact MDR capability tag for the R13 cross-vendor overlap", () => {
    expect(record.contract!.capabilityTags).toContain("Managed Detection & Response (MDR)");
  });

  it("expected findings are positive and match engineered literals", () => {
    expect(expected).toHaveLength(1);
    const r09 = expected.find((e) => e.ruleId === "R09")!;
    expect(r09.annualizedSavingsCents).toBeGreaterThan(0);
    expect(r09.annualizedSavingsCents).toBe(8_400_000); // $84,000 (right-size to $396K)
  });
});

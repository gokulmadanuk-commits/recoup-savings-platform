import { describe, it, expect } from "vitest";
import seed from "./deskflow";
import { COMPANY } from "../helpers";
import { vendorRecordToDocModels } from "../../docmodel/to-docmodel";
import { assembleDataset } from "../../docmodel/from-docmodel";

const { record, expected } = seed;

describe("DeskFlow ITSM seed", () => {
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

  it("R01 auto-renewal contract is within the 90-day window with a closed notice", () => {
    expect(record.contract!.autoRenew).toBe(true);
    expect(record.contract!.endDate).toBe("2026-08-18");
    expect(record.contract!.noticeWindowDays).toBe(60);
  });

  it("expected findings are positive and match engineered literals", () => {
    expect(expected).toHaveLength(1);
    const r01 = expected.find((e) => e.ruleId === "R01")!;
    expect(r01.annualizedSavingsCents).toBeGreaterThan(0);
    expect(r01.annualizedSavingsCents).toBe(471_072); // $4,710.72 renewal uplift (+7%)
  });
});

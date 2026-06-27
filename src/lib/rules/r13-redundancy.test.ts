import { describe, it, expect } from "vitest";
import rule from "./r13-redundancy";
import { makeContext } from "./types";
import { seedDataset } from "../seed";
import { EXPECTED } from "../seed";
import { DatasetSchema } from "../types";

/** Minimal one-line-invoice vendor for robustness fixtures. */
function vendor(id: string, tags: string[], lineDesc: string, monthly: number) {
  return {
    vendor: { id, name: id, category: "x", aliases: [] },
    contract: {
      id: `C-${id}`, vendorId: id, vendorName: id, category: "x", sourceDoc: `${id}.pdf`,
      customer: "X", effectiveDate: "2025-01-01", endDate: "2027-12-31", initialTermMonths: 24,
      autoRenew: true, noticeWindowDays: 30, currentAnnualValueCents: monthly * 12,
      payment: { netDays: 30 }, capabilityTags: tags,
    },
    invoices: [{
      id: `I-${id}`, vendorId: id, vendorName: id, sourceDoc: `${id}-inv.pdf`,
      invoiceNumber: `INV-${id}`, invoiceDate: "2026-01-05", subtotalCents: monthly, totalCents: monthly,
      lines: [{ description: lineDesc, qty: 1, unitPriceCents: monthly, lineTotalCents: monthly, lineType: "recurring" }],
    }],
    usage: [],
  };
}
function ctxOf(vendors: ReturnType<typeof vendor>[]) {
  return makeContext(DatasetSchema.parse({ customer: "X", analysisDate: "2026-06-27", vendors }));
}

const expectedForRule = EXPECTED.filter((e) => e.ruleId === "R13");

describe("R13 — Cross-Vendor Redundant Tool", () => {
  const ctx = makeContext(seedDataset());
  const findings = rule.run(ctx);

  it("fires on exactly the EXPECTED set of vendors (no misses, no false positives)", () => {
    const fired = findings.map((f) => f.vendorId).sort();
    const want = expectedForRule.map((e) => e.vendorId).sort();
    expect(fired).toEqual(want);
  });

  it("produces exactly one finding", () => {
    expect(findings).toHaveLength(1);
  });

  it("matches EXPECTED annualizedSavingsCents and savingsType per vendor", () => {
    for (const exp of expectedForRule) {
      const f = findings.find((x) => x.vendorId === exp.vendorId);
      expect(f, `no finding for ${exp.vendorId}`).toBeDefined();
      expect(f!.savingsType).toBe(exp.savingsType);
      const tol = Math.max(1, Math.abs(exp.annualizedSavingsCents) * 0.01);
      expect(Math.abs(f!.annualizedSavingsCents - exp.annualizedSavingsCents)).toBeLessThanOrEqual(tol);
    }
  });

  it("attributes the finding to redshield-cyber for ~$28,000/yr avoidance", () => {
    const f = findings.find((x) => x.vendorId === "redshield-cyber");
    expect(f).toBeDefined();
    expect(f!.category).toBe("tier_optimization");
    expect(f!.savingsType).toBe("avoidance");
    // $27,999.96
    expect(f!.annualizedSavingsCents).toBe(2_799_996);
  });

  it("every finding has non-empty evidence and a non-null recommendedAsk", () => {
    for (const f of findings) {
      expect(f.evidence.length).toBeGreaterThan(0);
      expect(f.recommendedAsk).not.toBeNull();
      expect(f.recommendedAsk).toBeTruthy();
    }
  });
});

describe("R13 — classification is spend-based, not tag-count based", () => {
  it("eliminates a focused standalone even when it lists 4+ capability tags", () => {
    const findings = rule.run(
      ctxOf([
        // 100% MDR spend, but 4 tags — must still be eliminable.
        vendor("focused-mdr", ["Managed Detection & Response (MDR)", "Alpha", "Beta", "Gamma"], "Managed Detection & Response (MDR) 24x7 SOC", 2_000_00),
        // Broad infra contract that bundles MDR but bills 0% of it.
        vendor("broad-infra", ["Cloud", "Compute", "Managed Detection & Response (MDR)"], "Cloud Compute and Storage", 40_000_00),
      ]),
    );
    expect(findings.map((f) => f.vendorId)).toEqual(["focused-mdr"]);
  });

  it("does NOT fire when two peers merely list a shared capability neither bills (no standalone)", () => {
    const findings = rule.run(
      ctxOf([
        vendor("payroll-co", ["Payroll", "Benefits Administration"], "Payroll Processing", 5_000_00),
        vendor("hris-co", ["HRIS", "Benefits Administration"], "HRIS Platform Subscription", 5_000_00),
      ]),
    );
    expect(findings).toEqual([]);
  });
});

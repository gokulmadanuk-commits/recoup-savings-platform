import { describe, it, expect } from "vitest";
import rule from "./r01-auto-renewal";
import { makeContext } from "./types";
import { seedDataset, EXPECTED } from "../seed";

const RULE_ID = "R01";

const expectedForRule = EXPECTED.filter((e) => e.ruleId === RULE_ID);

describe("R01 — Auto-Renewal Notice-Window Alert", () => {
  const ctx = makeContext(seedDataset());
  const findings = rule.run(ctx);

  it("fires on exactly the EXPECTED set of vendors (no misses, no false positives)", () => {
    const got = [...new Set(findings.map((f) => f.vendorId))].sort();
    const want = [...new Set(expectedForRule.map((e) => e.vendorId))].sort();
    expect(got).toEqual(want);
  });

  it("matches EXPECTED annualizedSavingsCents and savingsType for each fired vendor", () => {
    for (const exp of expectedForRule) {
      const f = findings.find((x) => x.vendorId === exp.vendorId);
      expect(f, `expected a finding for ${exp.vendorId}`).toBeDefined();
      if (!f) continue;

      expect(f.savingsType).toBe(exp.savingsType);

      const tol = Math.max(
        1,
        Math.abs(exp.annualizedSavingsCents) * 0.01,
      );
      expect(
        Math.abs(f.annualizedSavingsCents - exp.annualizedSavingsCents),
        `${exp.vendorId}: got ${f.annualizedSavingsCents}, expected ${exp.annualizedSavingsCents}`,
      ).toBeLessThanOrEqual(tol);
    }
  });

  it("produces the exact (not just within-tolerance) planted values", () => {
    const byVendor = Object.fromEntries(
      findings.map((f) => [f.vendorId, f.annualizedSavingsCents]),
    );
    expect(byVendor["deskflow-itsm"]).toBe(471_072);
    expect(byVendor["payworks-hcm"]).toBe(3_434_400);
  });

  it("sets severity from the notice deadline (deskflow critical, payworks watch)", () => {
    const deskflow = findings.find((f) => f.vendorId === "deskflow-itsm");
    const payworks = findings.find((f) => f.vendorId === "payworks-hcm");
    // deskflow notice deadline 2026-06-19 already passed -> critical
    expect(deskflow?.severity).toBe("critical");
    // payworks notice deadline 2026-07-12 is 15 days out (>14) -> watch
    expect(payworks?.severity).toBe("watch");
  });

  it("carries the renewal value as atRiskCents and a notice deadlineDate", () => {
    for (const f of findings) {
      expect(f.atRiskCents).toBeGreaterThan(f.annualizedSavingsCents);
      expect(f.deadlineDate).toBeTruthy();
    }
  });

  it("every finding has non-empty evidence and a non-null recommendedAsk", () => {
    expect(findings.length).toBeGreaterThan(0);
    for (const f of findings) {
      expect(f.evidence.length).toBeGreaterThan(0);
      expect(f.recommendedAsk).toBeTruthy();
    }
  });
});

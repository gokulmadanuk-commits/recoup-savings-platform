import { describe, it, expect } from "vitest";
import rule from "./r08-early-pay";
import { makeContext } from "./types";
import { seedDataset, EXPECTED } from "../seed";

const RULE_ID = "R08";

describe("R08 — Missed Early-Pay Discount", () => {
  const ds = seedDataset();
  const findings = rule.run(makeContext(ds));
  const expected = EXPECTED.filter((e) => e.ruleId === RULE_ID);

  it("fires on exactly the vendors in the answer key (no misses, no false positives)", () => {
    const firedVendors = findings.map((f) => f.vendorId).sort();
    const expectedVendors = expected.map((e) => e.vendorId).sort();
    expect(firedVendors).toEqual(expectedVendors);
  });

  it("matches the expected annualized savings and savingsType for each fired vendor", () => {
    for (const exp of expected) {
      const f = findings.find((x) => x.vendorId === exp.vendorId);
      expect(f, `no finding for ${exp.vendorId}`).toBeDefined();
      if (!f) continue;
      expect(f.savingsType).toBe(exp.savingsType);
      // Prefer exact; allow <=1% rounding tolerance.
      const tol = Math.max(1, Math.round(exp.annualizedSavingsCents * 0.01));
      expect(Math.abs(f.annualizedSavingsCents - exp.annualizedSavingsCents)).toBeLessThanOrEqual(tol);
      // We compute this exactly — assert it too.
      expect(f.annualizedSavingsCents).toBe(exp.annualizedSavingsCents);
      expect(f.category).toBe("missed_discount");
    }
  });

  it("reports recoverableToDate that matches the answer key", () => {
    for (const exp of expected) {
      if (exp.recoverableToDateCents == null) continue;
      const f = findings.find((x) => x.vendorId === exp.vendorId);
      expect(f).toBeDefined();
      if (!f) continue;
      expect(f.recoverableToDateCents).toBe(exp.recoverableToDateCents);
    }
  });

  it("every finding has non-empty evidence and a recommendedAsk", () => {
    expect(findings.length).toBeGreaterThan(0);
    for (const f of findings) {
      expect(f.evidence.length).toBeGreaterThan(0);
      expect(f.recommendedAsk).not.toBeNull();
      expect(f.recommendedAsk).toBeTruthy();
    }
  });
});

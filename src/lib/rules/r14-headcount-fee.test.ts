import { describe, it, expect } from "vitest";
import rule from "./r14-headcount-fee";
import { makeContext } from "./types";
import { seedDataset } from "../seed";
import { EXPECTED } from "../seed";

const TOLERANCE_PCT = 0.01;

describe("R14 — Headcount-Based Fee Overbilling", () => {
  const ctx = makeContext(seedDataset());
  const findings = rule.run(ctx);

  const expectedR14 = EXPECTED.filter((e) => e.ruleId === "R14");

  it("fires on exactly the EXPECTED set of vendors", () => {
    const fired = findings.map((f) => f.vendorId).sort();
    const expectedVendors = expectedR14.map((e) => e.vendorId).sort();
    expect(fired).toEqual(expectedVendors);
  });

  it("matches the EXPECTED annualized savings and savingsType per vendor", () => {
    for (const exp of expectedR14) {
      const f = findings.find((x) => x.vendorId === exp.vendorId);
      expect(f, `missing finding for ${exp.vendorId}`).toBeDefined();
      if (!f) continue;

      const tol = Math.max(1, Math.round(exp.annualizedSavingsCents * TOLERANCE_PCT));
      expect(
        Math.abs(f.annualizedSavingsCents - exp.annualizedSavingsCents),
        `annualized savings for ${exp.vendorId}: got ${f.annualizedSavingsCents}, expected ${exp.annualizedSavingsCents}`,
      ).toBeLessThanOrEqual(tol);

      expect(f.savingsType).toBe(exp.savingsType);
      expect(f.category).toBe("overbilling");

      if (exp.recoverableToDateCents != null) {
        const rtol = Math.max(
          1,
          Math.round(exp.recoverableToDateCents * TOLERANCE_PCT),
        );
        expect(
          Math.abs(f.recoverableToDateCents - exp.recoverableToDateCents),
          `recoverable for ${exp.vendorId}: got ${f.recoverableToDateCents}, expected ${exp.recoverableToDateCents}`,
        ).toBeLessThanOrEqual(rtol);
      }
    }
  });

  it("every finding has non-empty evidence and a non-null recommendedAsk", () => {
    expect(findings.length).toBeGreaterThan(0);
    for (const f of findings) {
      expect(f.evidence.length).toBeGreaterThan(0);
      expect(f.recommendedAsk).not.toBeNull();
      expect(f.recommendedAsk).toBeTruthy();
    }
  });
});

import { describe, it, expect } from "vitest";
import rule from "./r12-overbilling";
import { makeContext } from "./types";
import { seedDataset } from "../seed";
import { EXPECTED } from "../seed";

const expectedR12 = EXPECTED.filter((e) => e.ruleId === "R12");

describe("R12 — Service / Labor Overbilling", () => {
  const ds = seedDataset();
  const findings = rule.run(makeContext(ds));
  const byVendor = new Map(findings.map((f) => [f.vendorId, f]));

  it("fires on exactly the expected vendor set", () => {
    const fired = findings.map((f) => f.vendorId).sort();
    const expected = expectedR12.map((e) => e.vendorId).sort();
    expect(fired).toEqual(expected);
  });

  it("matches the expected annualized savings and savingsType for each vendor", () => {
    for (const exp of expectedR12) {
      const f = byVendor.get(exp.vendorId);
      expect(f, `missing finding for ${exp.vendorId}`).toBeDefined();
      if (!f) continue;
      expect(f.savingsType).toBe(exp.savingsType);
      const tol = Math.max(1, Math.round(exp.annualizedSavingsCents * 0.01));
      expect(
        Math.abs(f.annualizedSavingsCents - exp.annualizedSavingsCents),
        `annualized savings for ${exp.vendorId}: got ${f.annualizedSavingsCents}, expected ${exp.annualizedSavingsCents}`,
      ).toBeLessThanOrEqual(tol);
      if (exp.recoverableToDateCents != null) {
        const rtol = Math.max(1, Math.round(exp.recoverableToDateCents * 0.01));
        expect(
          Math.abs(f.recoverableToDateCents - exp.recoverableToDateCents),
        ).toBeLessThanOrEqual(rtol);
      }
    }
  });

  it("every finding has the overbilling category and recovery type", () => {
    for (const f of findings) {
      expect(f.category).toBe("overbilling");
      expect(f.savingsType).toBe("recovery");
    }
  });

  it("every finding has non-empty evidence and a non-null recommendedAsk", () => {
    expect(findings.length).toBeGreaterThan(0);
    for (const f of findings) {
      expect(f.evidence.length).toBeGreaterThan(0);
      expect(f.recommendedAsk).not.toBeNull();
      expect(f.recommendedAsk?.length ?? 0).toBeGreaterThan(0);
    }
  });
});

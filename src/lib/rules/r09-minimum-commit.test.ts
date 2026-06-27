import { describe, it, expect } from "vitest";
import rule from "./r09-minimum-commit";
import { seedDataset, EXPECTED } from "../seed";
import { makeContext } from "./types";

const expectedR09 = EXPECTED.filter((e) => e.ruleId === "R09");

describe("R09 — Minimum Commitment Shortfall", () => {
  const ctx = makeContext(seedDataset());
  const findings = rule.run(ctx);

  it("fires on exactly the expected set of vendors (no misses, no false positives)", () => {
    const fired = findings.map((f) => f.vendorId).sort();
    const expected = expectedR09.map((e) => e.vendorId).sort();
    expect(fired).toEqual(expected);
  });

  it("matches the expected annualized savings and savingsType per vendor", () => {
    for (const exp of expectedR09) {
      const f = findings.find((x) => x.vendorId === exp.vendorId);
      expect(f, `missing finding for ${exp.vendorId}`).toBeDefined();
      if (!f) continue;

      const tol = Math.max(1, Math.abs(exp.annualizedSavingsCents) * 0.01);
      expect(
        Math.abs(f.annualizedSavingsCents - exp.annualizedSavingsCents),
        `annualizedSavingsCents for ${exp.vendorId}: got ${f.annualizedSavingsCents}, expected ${exp.annualizedSavingsCents}`,
      ).toBeLessThanOrEqual(tol);
      // Prefer exact for this deterministic seed.
      expect(f.annualizedSavingsCents).toBe(exp.annualizedSavingsCents);
      expect(f.savingsType).toBe(exp.savingsType);
      expect(f.category).toBe("minimum_commit");
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

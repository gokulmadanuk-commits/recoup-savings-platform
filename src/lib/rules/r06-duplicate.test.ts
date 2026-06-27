import { describe, it, expect } from "vitest";
import rule from "./r06-duplicate";
import { makeContext } from "./types";
import { seedDataset } from "../seed";
import { EXPECTED } from "../seed";

const expectedR06 = EXPECTED.filter((e) => e.ruleId === "R06");

describe("R06 — Duplicate / Double Billing", () => {
  const findings = rule.run(makeContext(seedDataset()));

  it("fires on exactly the vendors in the answer key", () => {
    const fired = findings.map((f) => f.vendorId).sort();
    const expected = expectedR06.map((e) => e.vendorId).sort();
    expect(fired).toEqual(expected);
  });

  it("matches the expected savings, type, and recoverable amount", () => {
    for (const exp of expectedR06) {
      const f = findings.find((x) => x.vendorId === exp.vendorId);
      expect(f, `no finding for ${exp.vendorId}`).toBeDefined();
      if (!f) continue;

      const tol = Math.max(
        1,
        Math.round(exp.annualizedSavingsCents * 0.01),
      );
      expect(
        Math.abs(f.annualizedSavingsCents - exp.annualizedSavingsCents),
      ).toBeLessThanOrEqual(tol);
      expect(f.savingsType).toBe(exp.savingsType);
      expect(f.category).toBe("duplicate");

      if (exp.recoverableToDateCents != null) {
        expect(
          Math.abs(f.recoverableToDateCents - exp.recoverableToDateCents),
        ).toBeLessThanOrEqual(tol);
      }
    }
  });

  it("every finding carries evidence and a recommended ask", () => {
    expect(findings.length).toBeGreaterThan(0);
    for (const f of findings) {
      expect(f.evidence.length).toBeGreaterThan(0);
      expect(f.recommendedAsk).not.toBeNull();
      expect(f.recommendedAsk).toBeTruthy();
    }
  });
});

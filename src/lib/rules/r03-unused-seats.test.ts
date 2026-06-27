import { describe, it, expect } from "vitest";
import rule from "./r03-unused-seats";
import { makeContext } from "./types";
import { seedDataset } from "../seed";
import { EXPECTED } from "../seed";

const R03_EXPECTED = EXPECTED.filter((e) => e.ruleId === "R03");

describe("R03 — Unused Seats / Idle Licenses", () => {
  const ds = seedDataset();
  const findings = rule.run(makeContext(ds));

  it("fires on exactly the EXPECTED set of vendors (no misses, no false positives)", () => {
    const fired = findings.map((f) => f.vendorId).sort();
    const expected = R03_EXPECTED.map((e) => e.vendorId).sort();
    expect(fired).toEqual(expected);
  });

  it("matches the EXPECTED annualized savings and savingsType for each fired vendor", () => {
    for (const exp of R03_EXPECTED) {
      const f = findings.find((x) => x.vendorId === exp.vendorId);
      expect(f, `missing finding for ${exp.vendorId}`).toBeDefined();
      if (!f) continue;
      expect(f.savingsType).toBe(exp.savingsType);
      expect(f.category).toBe("unused_seats");
      const tol = Math.max(1, Math.abs(exp.annualizedSavingsCents) * 0.01);
      expect(
        Math.abs(f.annualizedSavingsCents - exp.annualizedSavingsCents),
        `${exp.vendorId}: got ${f.annualizedSavingsCents}, expected ${exp.annualizedSavingsCents}`,
      ).toBeLessThanOrEqual(tol);
    }
  });

  it("computes collabhub-suite exactly: 90 idle of 250 @ $45/seat/mo = $48,600/yr", () => {
    const f = findings.find((x) => x.vendorId === "collabhub-suite");
    expect(f).toBeDefined();
    expect(f?.annualizedSavingsCents).toBe(4_860_000);
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

import { describe, it, expect } from "vitest";
import r11 from "./r11-zombie-line";
import { makeContext } from "./types";
import { seedDataset } from "../seed";
import { EXPECTED } from "../seed";

const TOL = 0.01; // 1% rounding tolerance

describe("R11 — Zombie / Inactive Service Line", () => {
  const ds = seedDataset();
  const findings = r11.run(makeContext(ds));
  const expectedR11 = EXPECTED.filter((e) => e.ruleId === "R11");

  it("fires on exactly the vendors the answer key flags for R11", () => {
    const got = findings.map((f) => f.vendorId).sort();
    const want = expectedR11.map((e) => e.vendorId).sort();
    expect(got).toEqual(want);
  });

  it("emits one finding per fired vendor (no duplicates)", () => {
    const ids = findings.map((f) => f.vendorId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("matches the engineered annualized savings and savingsType per vendor", () => {
    for (const exp of expectedR11) {
      const f = findings.find((x) => x.vendorId === exp.vendorId);
      expect(f, `missing finding for ${exp.vendorId}`).toBeDefined();
      const diff = Math.abs(
        f!.annualizedSavingsCents - exp.annualizedSavingsCents,
      );
      expect(
        diff,
        `${exp.vendorId}: got ${f!.annualizedSavingsCents} want ${exp.annualizedSavingsCents}`,
      ).toBeLessThanOrEqual(exp.annualizedSavingsCents * TOL);
      expect(f!.savingsType).toBe(exp.savingsType);
      expect(f!.category).toBe("overbilling");
    }
  });

  it("matches recoverable-to-date where the answer key specifies it", () => {
    for (const exp of expectedR11) {
      if (exp.recoverableToDateCents == null) continue;
      const f = findings.find((x) => x.vendorId === exp.vendorId)!;
      const diff = Math.abs(
        f.recoverableToDateCents - exp.recoverableToDateCents,
      );
      expect(
        diff,
        `${exp.vendorId}: recoverable got ${f.recoverableToDateCents} want ${exp.recoverableToDateCents}`,
      ).toBeLessThanOrEqual(exp.recoverableToDateCents * TOL);
    }
  });

  it("every finding has non-empty evidence and a recommendedAsk", () => {
    expect(findings.length).toBeGreaterThan(0);
    for (const f of findings) {
      expect(f.evidence.length).toBeGreaterThan(0);
      expect(f.recommendedAsk).not.toBeNull();
      expect(f.recommendedAsk!.length).toBeGreaterThan(0);
    }
  });

  it("hits all four expected target vendors", () => {
    const ids = findings.map((f) => f.vendorId).sort();
    expect(ids).toEqual(
      [
        "cascade-power-water",
        "clearwave-mobile",
        "meridian-telecom",
        "summit-copier-leasing",
      ].sort(),
    );
  });
});

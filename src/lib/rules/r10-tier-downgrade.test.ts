import { describe, it, expect } from "vitest";
import rule from "./r10-tier-downgrade";
import { makeContext } from "./types";
import { seedDataset } from "../seed";
import { EXPECTED } from "../seed";

/**
 * R10 — Tier Downgrade / Right-Sizing.
 *
 * The current seed corpus plants NO R10 vendor, so EXPECTED contains no R10 rows
 * and the rule must fire on the empty set (no false positives) while remaining a
 * valid, complete Rule in the engine.
 */
describe("R10 — Tier Downgrade / Right-Sizing", () => {
  const ds = seedDataset();
  const findings = rule.run(makeContext(ds));

  const expectedForRule = EXPECTED.filter((e) => e.ruleId === "R10");

  it("is a valid Rule wired to tier_optimization", () => {
    expect(rule.id).toBe("R10");
    expect(rule.category).toBe("tier_optimization");
    expect(typeof rule.name).toBe("string");
    expect(rule.name.length).toBeGreaterThan(0);
    expect(typeof rule.run).toBe("function");
  });

  it("EXPECTED has no R10 targets (no planted vendor)", () => {
    expect(expectedForRule).toEqual([]);
  });

  it("fires on exactly the EXPECTED set of vendors (empty)", () => {
    const firedOn = [...new Set(findings.map((f) => f.vendorId))].sort();
    const expectedVendors = [...new Set(expectedForRule.map((e) => e.vendorId))].sort();
    expect(firedOn).toEqual(expectedVendors);
    expect(firedOn).toEqual([]);
  });

  it("produces zero findings (no false positives)", () => {
    expect(findings).toEqual([]);
  });

  it("every finding has the right shape, evidence and ask (vacuously true here)", () => {
    for (const f of findings) {
      const exp = expectedForRule.find((e) => e.vendorId === f.vendorId);
      expect(exp).toBeDefined();
      expect(f.savingsType).toBe(exp!.savingsType);
      const tol = Math.max(1, Math.round(exp!.annualizedSavingsCents * 0.01));
      expect(Math.abs(f.annualizedSavingsCents - exp!.annualizedSavingsCents)).toBeLessThanOrEqual(tol);
      expect(f.evidence.length).toBeGreaterThan(0);
      expect(f.recommendedAsk).not.toBeNull();
    }
  });
});

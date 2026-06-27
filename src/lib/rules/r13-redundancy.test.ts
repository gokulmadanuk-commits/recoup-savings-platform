import { describe, it, expect } from "vitest";
import rule from "./r13-redundancy";
import { makeContext } from "./types";
import { seedDataset } from "../seed";
import { EXPECTED } from "../seed";

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

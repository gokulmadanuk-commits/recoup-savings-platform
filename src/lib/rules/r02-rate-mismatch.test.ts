import { describe, it, expect } from "vitest";
import rule from "./r02-rate-mismatch";
import { seedDataset, EXPECTED } from "../seed";
import { makeContext } from "./types";

const RULE_ID = "R02";

describe("R02 — Invoice Rate Mismatch", () => {
  const ds = seedDataset();
  const findings = rule.run(makeContext(ds));
  const expected = EXPECTED.filter((e) => e.ruleId === RULE_ID);

  it("fires on exactly the vendors in the answer key (no misses, no false positives)", () => {
    const firedVendors = [...new Set(findings.map((f) => f.vendorId))].sort();
    const expectedVendors = [...new Set(expected.map((e) => e.vendorId))].sort();
    expect(firedVendors).toEqual(expectedVendors);
  });

  it("emits one finding per fired vendor", () => {
    const counts = new Map<string, number>();
    for (const f of findings) counts.set(f.vendorId, (counts.get(f.vendorId) ?? 0) + 1);
    for (const [, n] of counts) expect(n).toBe(1);
  });

  for (const e of expected) {
    it(`matches EXPECTED annualized savings + savingsType for ${e.vendorId}`, () => {
      const f = findings.find((x) => x.vendorId === e.vendorId);
      expect(f).toBeDefined();
      if (!f) return;
      expect(f.savingsType).toBe(e.savingsType);
      const tol = Math.max(1, Math.round(e.annualizedSavingsCents * 0.01));
      expect(Math.abs(f.annualizedSavingsCents - e.annualizedSavingsCents)).toBeLessThanOrEqual(tol);
      // Prefer exact for these deterministic seeds.
      expect(f.annualizedSavingsCents).toBe(e.annualizedSavingsCents);
      if (e.recoverableToDateCents !== undefined) {
        expect(f.recoverableToDateCents).toBe(e.recoverableToDateCents);
      }
      expect(f.category).toBe("rate_mismatch");
    });
  }

  it("every finding has non-empty evidence and a recommendedAsk", () => {
    expect(findings.length).toBeGreaterThan(0);
    for (const f of findings) {
      expect(f.evidence.length).toBeGreaterThan(0);
      expect(f.recommendedAsk).not.toBeNull();
      expect((f.recommendedAsk ?? "").length).toBeGreaterThan(0);
    }
  });
});

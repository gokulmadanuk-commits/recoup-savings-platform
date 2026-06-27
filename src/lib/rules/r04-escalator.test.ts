/**
 * R04 — Price-Escalator / Above-Market Challenge.
 *
 * Verifies the rule against the answer key: it fires on exactly the EXPECTED set
 * of vendors (no misses, no false positives), and each finding's annualized
 * savings + savingsType match the planted value.
 */
import { describe, it, expect } from "vitest";
import rule from "./r04-escalator";
import { makeContext } from "./types";
import { seedDataset, EXPECTED } from "../seed";

const RULE_ID = "R04";

const expectedForRule = EXPECTED.filter((e) => e.ruleId === RULE_ID);

function run() {
  const ctx = makeContext(seedDataset());
  return rule.run(ctx);
}

describe("R04 price-escalator / above-market challenge", () => {
  it("fires on exactly the EXPECTED set of vendors", () => {
    const fired = run()
      .map((f) => f.vendorId)
      .sort();
    const want = expectedForRule.map((e) => e.vendorId).sort();
    expect(fired).toEqual(want);
  });

  it("matches the EXPECTED annualized savings and savingsType per vendor", () => {
    const findings = run();
    for (const exp of expectedForRule) {
      const f = findings.find((x) => x.vendorId === exp.vendorId);
      expect(f, `missing finding for ${exp.vendorId}`).toBeDefined();
      if (!f) continue;

      const tol = Math.max(
        1,
        Math.ceil(exp.annualizedSavingsCents * (exp.tolerancePct ?? 0.01)),
      );
      expect(
        Math.abs(f.annualizedSavingsCents - exp.annualizedSavingsCents),
        `${exp.vendorId}: got ${f.annualizedSavingsCents}, want ${exp.annualizedSavingsCents}`,
      ).toBeLessThanOrEqual(tol);

      expect(f.savingsType, `${exp.vendorId} savingsType`).toBe(exp.savingsType);
      expect(f.category).toBe("price_escalator");
    }
  });

  it("emits rich, actionable findings (evidence + recommendedAsk)", () => {
    const findings = run();
    expect(findings.length).toBe(expectedForRule.length);
    for (const f of findings) {
      expect(f.evidence.length).toBeGreaterThan(0);
      expect(f.recommendedAsk).toBeTruthy();
      expect(f.recommendedAsk).not.toBeNull();
      expect(f.annualizedSavingsCents).toBeGreaterThan(0);
    }
  });
});

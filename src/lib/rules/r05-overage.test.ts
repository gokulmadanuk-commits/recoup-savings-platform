import { describe, it, expect } from "vitest";
import r05 from "./r05-overage";
import { makeContext } from "./types";
import { seedDataset } from "../seed";
import { EXPECTED } from "../seed";

const RULE_ID = "R05";

/** Authoritative targets for this rule from the answer key. */
const expectedForRule = EXPECTED.filter((e) => e.ruleId === RULE_ID);

function runRule() {
  return r05.run(makeContext(seedDataset()));
}

describe("R05 — Overage / Usage-Tier Mismatch", () => {
  it("fires on exactly the vendors the answer key expects", () => {
    const fired = runRule()
      .map((f) => f.vendorId)
      .sort();
    const expected = expectedForRule.map((e) => e.vendorId).sort();
    expect(fired).toEqual(expected);
  });

  it("matches the expected annualized savings and savings type per vendor", () => {
    const findings = runRule();
    for (const exp of expectedForRule) {
      const finding = findings.find((f) => f.vendorId === exp.vendorId);
      expect(finding, `no finding for ${exp.vendorId}`).toBeTruthy();
      if (!finding) continue;

      expect(finding.savingsType).toBe(exp.savingsType);
      expect(finding.category).toBe("tier_optimization");

      const tol = Math.max(
        1,
        Math.round(exp.annualizedSavingsCents * 0.01),
      );
      expect(
        Math.abs(finding.annualizedSavingsCents - exp.annualizedSavingsCents),
        `savings mismatch for ${exp.vendorId}: got ${finding.annualizedSavingsCents}, expected ${exp.annualizedSavingsCents}`,
      ).toBeLessThanOrEqual(tol);
    }
  });

  it("emits rich evidence and a concrete recommended ask for every finding", () => {
    const findings = runRule();
    expect(findings.length).toBe(expectedForRule.length);
    for (const finding of findings) {
      expect(finding.evidence.length).toBeGreaterThan(0);
      expect(finding.recommendedAsk).toBeTruthy();
      expect(finding.recommendedAsk).not.toBeNull();
      expect(finding.title.length).toBeGreaterThan(0);
      expect(finding.summary.length).toBeGreaterThan(0);
    }
  });

  it("hits both planted targets at the exact figures", () => {
    const findings = runRule();
    const vaultsign = findings.find((f) => f.vendorId === "vaultsign-esignature");
    const catalyst = findings.find(
      (f) => f.vendorId === "catalyst-creative-agency",
    );
    expect(vaultsign?.annualizedSavingsCents).toBe(1_140_000); // $11,400
    expect(catalyst?.annualizedSavingsCents).toBe(5_550_000); // $55,500
  });
});

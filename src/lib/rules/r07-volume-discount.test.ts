import { describe, it, expect } from "vitest";
import rule from "./r07-volume-discount";
import { makeContext } from "./types";
import { seedDataset, EXPECTED } from "../seed";

const RULE_ID = "R07";

describe("R07 — Missed Volume Discount", () => {
  const ctx = makeContext(seedDataset());
  const findings = rule.run(ctx);

  const expectedForRule = EXPECTED.filter((e) => e.ruleId === RULE_ID);

  it("fires on exactly the vendors in the answer key", () => {
    const fired = findings.map((f) => f.vendorId).sort();
    const expected = expectedForRule.map((e) => e.vendorId).sort();
    expect(fired).toEqual(expected);
  });

  it("matches the expected annualized savings and savingsType for each fired vendor", () => {
    for (const exp of expectedForRule) {
      const f = findings.find((x) => x.vendorId === exp.vendorId);
      expect(f, `finding for ${exp.vendorId}`).toBeDefined();
      // Prefer exact; allow <=1% rounding tolerance.
      const tol = Math.max(1, Math.ceil(exp.annualizedSavingsCents * 0.01));
      expect(
        Math.abs(f!.annualizedSavingsCents - exp.annualizedSavingsCents),
        `annualizedSavingsCents for ${exp.vendorId} (got ${f!.annualizedSavingsCents}, want ${exp.annualizedSavingsCents})`,
      ).toBeLessThanOrEqual(tol);
      expect(f!.savingsType).toBe(exp.savingsType);
    }
  });

  it("matches recoverableToDateCents where the answer key specifies it", () => {
    for (const exp of expectedForRule) {
      if (exp.recoverableToDateCents === undefined) continue;
      const f = findings.find((x) => x.vendorId === exp.vendorId)!;
      const tol = Math.max(1, Math.ceil(exp.recoverableToDateCents * 0.01));
      expect(
        Math.abs(f.recoverableToDateCents - exp.recoverableToDateCents),
      ).toBeLessThanOrEqual(tol);
    }
  });

  it("every finding carries non-empty evidence and a recommendedAsk", () => {
    expect(findings.length).toBeGreaterThan(0);
    for (const f of findings) {
      expect(f.evidence.length).toBeGreaterThan(0);
      expect(f.recommendedAsk).not.toBeNull();
      expect((f.recommendedAsk ?? "").length).toBeGreaterThan(0);
      expect(f.category).toBe("missed_discount");
    }
  });

  it("fires on nimbusedge-cdn at $12,800.04/yr", () => {
    const f = findings.find((x) => x.vendorId === "nimbusedge-cdn");
    expect(f).toBeDefined();
    expect(f!.annualizedSavingsCents).toBe(1_280_004);
    expect(f!.recoverableToDateCents).toBe(1_280_004);
  });
});

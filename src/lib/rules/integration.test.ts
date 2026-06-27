import { describe, it, expect } from "vitest";
import { ALL_RULES, runRules, makeContext, summarize } from "./index";
import { seedDataset, EXPECTED } from "../seed";
import { toDollars } from "../money";

const dataset = seedDataset();
const findings = runRules(ALL_RULES, makeContext(dataset));
const key = (vendorId: string, ruleId: string) => `${vendorId}::${ruleId}`;

describe("full detection engine over the seed corpus", () => {
  it("produces exactly one finding per answer-key entry (no misses, no false positives)", () => {
    const found = new Set(findings.map((f) => key(f.vendorId, f.ruleId)));
    const expected = new Set(EXPECTED.map((e) => key(e.vendorId, e.ruleId)));

    const misses = [...expected].filter((k) => !found.has(k));
    const falsePositives = [...found].filter((k) => !expected.has(k));
    expect(misses, `missed: ${misses.join(", ")}`).toEqual([]);
    expect(falsePositives, `false positives: ${falsePositives.join(", ")}`).toEqual([]);
    expect(findings.length).toBe(EXPECTED.length);
  });

  it("matches the answer key amount and savings type for every finding", () => {
    for (const e of EXPECTED) {
      const f = findings.find((x) => x.vendorId === e.vendorId && x.ruleId === e.ruleId)!;
      expect(f, `${e.vendorId}/${e.ruleId} exists`).toBeTruthy();
      expect(f.savingsType, `${e.vendorId}/${e.ruleId} type`).toBe(e.savingsType);
      expect(
        Math.abs(f.annualizedSavingsCents - e.annualizedSavingsCents),
        `${e.vendorId}/${e.ruleId} amount: got ${f.annualizedSavingsCents}, expected ${e.annualizedSavingsCents}`,
      ).toBeLessThanOrEqual(1);
    }
  });

  it("every finding carries evidence and a recommended ask", () => {
    for (const f of findings) {
      expect(f.evidence.length, `${f.id} evidence`).toBeGreaterThan(0);
      expect(f.recommendedAsk, `${f.id} ask`).toBeTruthy();
      expect(f.estimatedFeeCents).toBe(
        Math.round(f.annualizedSavingsCents * (f.savingsType === "recovery" ? 0.3 : 0.2)),
      );
    }
  });

  it("ranks findings by annualized savings (descending)", () => {
    for (let i = 1; i < findings.length; i++) {
      expect(findings[i - 1].annualizedSavingsCents).toBeGreaterThanOrEqual(
        findings[i].annualizedSavingsCents,
      );
    }
  });

  it("rolls up to a credible portfolio total (~7% of spend)", () => {
    const s = summarize(dataset, findings, { processed: 302, failed: 0 });
    const total = toDollars(s.totalAnnualizedSavingsCents);
    expect(total).toBeGreaterThan(450_000);
    expect(total).toBeLessThan(560_000);
    const pct = s.totalAnnualizedSavingsCents / s.totalAnnualSpendCents;
    expect(pct).toBeGreaterThan(0.03);
    expect(pct).toBeLessThan(0.15);
    // eslint-disable-next-line no-console
    console.log(
      `\n  Portfolio: $${Math.round(total).toLocaleString()} found across ${s.findingCount} findings, ` +
        `${(pct * 100).toFixed(1)}% of $${Math.round(toDollars(s.totalAnnualSpendCents)).toLocaleString()} spend; ` +
        `est. fee $${Math.round(toDollars(s.estimatedFeeCents)).toLocaleString()}.`,
    );
  });
});

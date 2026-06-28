import { describe, it, expect } from "vitest";
import { ALL_REVENUE_RULES } from "./index";
import { runRevenueRules } from "./runner";
import { revenueSeedDataset, REVENUE_EXPECTED, CUSTOMER_SEEDS } from "../seed";
import { rankRevenueFindings } from "./rank";

const dataset = revenueSeedDataset();
const findings = runRevenueRules(ALL_REVENUE_RULES, dataset);
const keyOf = (f: { customerId: string; ruleId: string }) =>
  `${f.customerId}::${f.ruleId}`;

describe("revenue engine — full corpus integration", () => {
  it("produces exactly one finding per answer-key entry — no misses, no false positives", () => {
    expect(findings.length).toBe(REVENUE_EXPECTED.length);
    const got = new Set(findings.map(keyOf));
    const want = new Set(REVENUE_EXPECTED.map(keyOf));
    // No finding outside the answer key (false positives), none missing.
    expect([...got].filter((k) => !want.has(k))).toEqual([]);
    expect([...want].filter((k) => !got.has(k))).toEqual([]);
  });

  it("reproduces every planted amount, category and risk grade exactly (±tolerance)", () => {
    for (const e of REVENUE_EXPECTED) {
      const f = findings.find(
        (x) => x.customerId === e.customerId && x.ruleId === e.ruleId,
      );
      expect(f, `missing ${keyOf(e)}`).toBeTruthy();
      if (!f) continue;
      const tol = e.tolerancePct ?? 0;
      const within = (got: number, exp: number) =>
        Math.abs(got - exp) <= Math.max(1, Math.round(exp * tol));
      expect(f.category, `${keyOf(e)} category`).toBe(e.category);
      expect(within(f.arrearsToDateCents, e.arrearsToDateCents), `${keyOf(e)} arrears: got ${f.arrearsToDateCents} want ${e.arrearsToDateCents}`).toBe(true);
      expect(within(f.annualizedUpliftCents, e.annualizedUpliftCents), `${keyOf(e)} uplift: got ${f.annualizedUpliftCents} want ${e.annualizedUpliftCents}`).toBe(true);
      expect(within(f.totalRecoverableCents, e.totalRecoverableCents), `${keyOf(e)} total: got ${f.totalRecoverableCents} want ${e.totalRecoverableCents}`).toBe(true);
      expect(f.relationshipRisk, `${keyOf(e)} risk grade`).toBe(e.relationshipRisk);
    }
  });

  it("ranks findings by total recoverable, descending", () => {
    const ranked = rankRevenueFindings(findings);
    for (let i = 1; i < ranked.length; i++) {
      expect(ranked[i - 1].totalRecoverableCents).toBeGreaterThanOrEqual(
        ranked[i].totalRecoverableCents,
      );
    }
    expect(findings[0].totalRecoverableCents).toBe(ranked[0].totalRecoverableCents);
  });

  it("every finding carries evidence, a recommended ask, a cited clause and a blended fee", () => {
    for (const f of findings) {
      expect(f.evidence.length, `${keyOf(f)} evidence`).toBeGreaterThanOrEqual(1);
      expect(f.recommendedAsk, `${keyOf(f)} ask`).toBeTruthy();
      expect(f.clauseCited, `${keyOf(f)} clause`).toBeTruthy();
      const expectedFee =
        Math.round(f.arrearsToDateCents * 0.3) +
        Math.round(f.annualizedUpliftCents * 0.2);
      expect(f.estimatedFeeCents, `${keyOf(f)} fee`).toBe(expectedFee);
      expect(f.recommendedAction).toMatch(/retroactive_claim|negotiate_partial|forward_only/);
    }
  });

  it("the 8 clean customers contribute no findings", () => {
    const ruleBearing = new Set(
      CUSTOMER_SEEDS.filter((s) => s.expected.length > 0).map((s) => s.record.customer.id),
    );
    const cleanWithFindings = findings.filter((f) => !ruleBearing.has(f.customerId));
    expect(cleanWithFindings).toEqual([]);
  });

  it("identifies a credible portfolio total (> $1M across the planted findings)", () => {
    const total = findings.reduce((a, f) => a + f.totalRecoverableCents, 0);
    expect(total).toBeGreaterThan(100_000_000); // > $1,000,000
  });
});

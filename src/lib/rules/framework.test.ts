import { describe, it, expect } from "vitest";
import { makeFinding, perVendorRule, makeContext } from "./types";
import { rankFindings, summarize } from "./rank";
import { runRules } from "./runner";
import { seedDataset } from "../seed";

describe("rule framework", () => {
  it("makeFinding computes the contingency fee from the savings type", () => {
    const recovery = makeFinding({
      ruleId: "R02", ruleName: "Rate Mismatch", category: "rate_mismatch",
      vendorId: "v", vendorName: "V", title: "t", summary: "s",
      savingsType: "recovery", annualizedSavingsCents: 1_000_000,
      confidence: 0.95, leverage: "l",
    });
    expect(recovery.feeRate).toBe(0.3);
    expect(recovery.estimatedFeeCents).toBe(300_000);

    const avoidance = makeFinding({
      ruleId: "R03", ruleName: "Unused Seats", category: "unused_seats",
      vendorId: "v", vendorName: "V", title: "t", summary: "s",
      savingsType: "avoidance", annualizedSavingsCents: 1_000_000,
      confidence: 0.8, leverage: "l",
    });
    expect(avoidance.feeRate).toBe(0.2);
    expect(avoidance.estimatedFeeCents).toBe(200_000);
  });

  it("perVendorRule isolates a vendor that throws", () => {
    const rule = perVendorRule("RX", "X", "other", (v) => {
      if (v.vendor.id === "brightseat-crm") throw new Error("boom");
      return [
        makeFinding({
          ruleId: "RX", ruleName: "X", category: "other",
          vendorId: v.vendor.id, vendorName: v.vendor.name, title: "t", summary: "s",
          savingsType: "avoidance", annualizedSavingsCents: 100, confidence: 0.5, leverage: "l",
        }),
      ];
    });
    const ds = seedDataset();
    const findings = rule.run(makeContext(ds));
    // brightseat throws -> skipped; every other vendor still produces one
    expect(findings.length).toBe(ds.vendors.length - 1);
    expect(findings.some((f) => f.vendorId === "brightseat-crm")).toBe(false);
    expect(findings.some((f) => f.vendorId === "collabhub-suite")).toBe(true);
  });

  it("rankFindings orders by annualized savings desc", () => {
    const mk = (cents: number, type: "recovery" | "avoidance" = "recovery") =>
      makeFinding({
        ruleId: "R", ruleName: "R", category: "other", vendorId: "v" + cents, vendorName: "V",
        title: "t", summary: "s", savingsType: type, annualizedSavingsCents: cents,
        confidence: 0.9, leverage: "l",
      });
    const ranked = rankFindings([mk(100), mk(900), mk(500)]);
    expect(ranked.map((f) => f.annualizedSavingsCents)).toEqual([900, 500, 100]);
  });

  it("runRules skips a rule that throws and ranks the rest", () => {
    const good = perVendorRule("RG", "G", "other", (v) => [
      makeFinding({
        ruleId: "RG", ruleName: "G", category: "other", vendorId: v.vendor.id,
        vendorName: v.vendor.name, title: "t", summary: "s", savingsType: "recovery",
        annualizedSavingsCents: 42, confidence: 0.9, leverage: "l",
      }),
    ]);
    const bad = { id: "RB", name: "B", category: "other" as const, run() { throw new Error("nope"); } };
    const findings = runRules([bad, good], makeContext(seedDataset()));
    expect(findings.length).toBeGreaterThan(0);
    expect(findings.every((f) => f.ruleId === "RG")).toBe(true);
  });

  it("summarize aggregates spend, savings, and fees", () => {
    const ds = seedDataset();
    const findings = [
      makeFinding({
        ruleId: "R02", ruleName: "R", category: "rate_mismatch", vendorId: "brightseat-crm",
        vendorName: "Brightseat CRM", title: "t", summary: "s", savingsType: "recovery",
        annualizedSavingsCents: 864_000, confidence: 0.95, leverage: "l",
      }),
      makeFinding({
        ruleId: "R03", ruleName: "R", category: "unused_seats", vendorId: "collabhub-suite",
        vendorName: "CollabHub Suite", title: "t", summary: "s", savingsType: "avoidance",
        annualizedSavingsCents: 4_860_000, confidence: 0.8, leverage: "l",
      }),
    ];
    const s = summarize(ds, findings, { processed: 30, failed: 0 });
    expect(s.findingCount).toBe(2);
    expect(s.totalRecoverableCents).toBe(864_000);
    expect(s.totalAvoidanceCents).toBe(4_860_000);
    expect(s.totalAnnualizedSavingsCents).toBe(5_724_000);
    expect(s.estimatedFeeCents).toBe(864_000 * 0.3 + 4_860_000 * 0.2);
    expect(s.documentsProcessed).toBe(30);
    expect(s.totalAnnualSpendCents).toBeGreaterThan(0);
  });
});

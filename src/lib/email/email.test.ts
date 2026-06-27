import { describe, it, expect } from "vitest";
import { makeFinding } from "../rules/types";
import { draftEmail, draftEmailsForTop } from "./draft";
import type { Finding } from "../types";

function finding(over: Partial<Parameters<typeof makeFinding>[0]>): Finding {
  return makeFinding({
    ruleId: "R02", ruleName: "Rate Mismatch", category: "rate_mismatch",
    vendorId: "brightseat-crm", vendorName: "Brightseat CRM",
    title: "Billed above contracted seat rate",
    summary: "Invoiced $48.60/seat vs $45.00 contracted on 200 seats for 12 months.",
    savingsType: "recovery", annualizedSavingsCents: 864_000, recoverableToDateCents: 864_000,
    confidence: 0.95, leverage: "Documented, repeated overcharge on the same SKU.",
    recommendedAsk: "issue a credit of $8,640 and reset the rate to $45.00/seat",
    evidence: [
      { label: "Contracted rate", value: "$45.00/seat", sourceDoc: "brightseat-crm-contract.pdf" },
      { label: "Invoiced rate", value: "$48.60/seat", sourceDoc: "brightseat-crm-invoice-2026-05.pdf" },
    ],
    ...over,
  });
}

describe("email drafting", () => {
  it("drafts an overcharge email with vendor, amount, and ask", () => {
    const d = draftEmail(finding({}));
    expect(d.to).toBe("accounts@brightseatcrm.com");
    expect(d.subject).toContain("Brightseat CRM");
    expect(d.subject).toContain("$8,640");
    expect(d.body).toContain("issue a credit of $8,640");
    expect(d.body).toContain("VP, Finance");
    expect(d.body).toContain("What we're seeing:");
  });

  it("picks the right template per category and rule", () => {
    const autoRenew = draftEmail(finding({ ruleId: "R01", category: "auto_renewal", deadlineDate: "2026-07-18" }));
    expect(autoRenew.subject).toContain("term adjustment");
    expect(autoRenew.body).toContain("July 18, 2026");

    const seats = draftEmail(finding({ ruleId: "R03", category: "unused_seats", savingsType: "avoidance" }));
    expect(seats.subject).toContain("right-sizing");

    const esc = draftEmail(finding({ ruleId: "R04", category: "price_escalator" }));
    expect(esc.subject).toContain("capping the annual uplift");

    const vol = draftEmail(finding({ ruleId: "R07", category: "missed_discount" }));
    expect(vol.subject).toContain("tier pricing");

    const early = draftEmail(finding({ ruleId: "R08", category: "missed_discount" }));
    expect(early.subject).toContain("early-pay");
  });

  it("drafts emails for the top N findings only", () => {
    const findings = Array.from({ length: 15 }, (_, i) =>
      finding({ id: `R02-v${i}`, vendorId: `v${i}`, vendorName: `Vendor ${i}` }),
    );
    expect(draftEmailsForTop(findings, 10)).toHaveLength(10);
  });
});

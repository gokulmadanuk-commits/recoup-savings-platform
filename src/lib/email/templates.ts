/**
 * Vendor negotiation email templates, keyed by finding category (derived from
 * the research email playbook). Each builder fills the deal-specific numbers,
 * leverage, and the exact ask into a CFO/procurement-grade message.
 */
import type { Finding } from "../types";
import { formatUSD } from "../money";
import { formatLong } from "../dates";

export const SENDER = {
  company: "Northwind Logistics Group, Inc.",
  name: "Jordan Avery",
  title: "VP, Finance",
  email: "jordan.avery@northwindlogistics.com",
} as const;

export interface DraftParts {
  subject: string;
  body: string;
}

function headlineAmount(f: Finding): string {
  const cents = f.recoverableToDateCents > 0 ? f.recoverableToDateCents : f.annualizedSavingsCents;
  return formatUSD(cents);
}

function deadlineLine(f: Finding): string {
  if (f.deadlineDate) return `by ${formatLong(f.deadlineDate)}`;
  return "within 10 business days";
}

function evidenceBlock(f: Finding): string {
  const rows = f.evidence.slice(0, 4).map((e) => `  • ${e.label}: ${e.value}`);
  return rows.length ? `\n\nWhat we're seeing:\n${rows.join("\n")}` : "";
}

function sign(): string {
  return `\n\nBest regards,\n${SENDER.name}\n${SENDER.title}, ${SENDER.company}\n${SENDER.email}`;
}

const ask = (f: Finding) =>
  f.recommendedAsk ?? "a corrected go-forward rate and a credit for the period in question";

type Builder = (f: Finding) => DraftParts;

const autoRenewal: Builder = (f) => ({
  subject: `${SENDER.company} – ${f.vendorName} renewal: term adjustment request`,
  body:
    `Hi ${f.vendorName} team,\n\n` +
    `We value the partnership and intend to keep working together, but I need to flag the upcoming auto-renewal on this agreement. ${f.summary}` +
    evidenceBlock(f) +
    `\n\nRather than let it renew on the current terms, we'd like to propose ${ask(f)}. ` +
    `${f.leverage}\n\n` +
    `Can you confirm ${deadlineLine(f)}? We'd prefer to resolve this collaboratively before it escalates to a formal contract review.` +
    sign(),
});

const overcharge: Builder = (f) => ({
  subject: `Billing discrepancy – ${f.vendorName} – correction requested (${headlineAmount(f)})`,
  body:
    `Hi ${f.vendorName} team,\n\n` +
    `We've been reconciling recent invoices against our contract and identified a discrepancy. ${f.summary}` +
    evidenceBlock(f) +
    `\n\nPlease issue a credit/refund of ${headlineAmount(f)} and correct the go-forward billing. ${ask(f)}. ` +
    `${f.leverage}\n\n` +
    `We'll remit any undisputed balance on standard terms. Please confirm the correction ${deadlineLine(f)}; we're happy to reconcile jointly under the audit-records provision.` +
    sign(),
});

const rightSizing: Builder = (f) => ({
  subject: `${f.vendorName} – right-sizing to actual usage`,
  body:
    `Hi ${f.vendorName} team,\n\n` +
    `Ahead of our renewal we pulled utilization and consumption data. ${f.summary}` +
    evidenceBlock(f) +
    `\n\nFor renewal we'd like to ${ask(f)}. To keep this simple and protect your unit economics, we'll hold the per-unit rate flat and add a true-up provision so we can scale back up at the same price. ` +
    `${f.leverage}\n\n` +
    `Can you have a revised order form to us ${deadlineLine(f)}? We'd rather expand from a clean baseline than carry shelfware into another term.` +
    sign(),
});

const escalator: Builder = (f) => ({
  subject: `${f.vendorName} renewal pricing – capping the annual uplift`,
  body:
    `Hi ${f.vendorName} team,\n\n` +
    `Thanks for the renewal terms. The applied increase is out of line with both our agreement and the market. ${f.summary}` +
    evidenceBlock(f) +
    `\n\nHere's a structure that works for both sides: ${ask(f)} — a contractual cap on any future increase (the lesser of CPI or 3–5%). In exchange we're prepared to commit to a multi-year term, which gives you revenue visibility. ` +
    `${f.leverage}\n\n` +
    `Can you confirm whether the cap is workable ${deadlineLine(f)}? A predictable ceiling lets us re-sign with confidence.` +
    sign(),
});

const volume: Builder = (f) => ({
  subject: `${f.vendorName} – tier pricing / volume true-up`,
  body:
    `Hi ${f.vendorName} team,\n\n` +
    `Reviewing our cumulative volume against the contracted tier schedule, our spend has crossed a discount threshold that wasn't applied. ${f.summary}` +
    evidenceBlock(f) +
    `\n\nWe'd like ${ask(f)} — the earned tier price applied retroactively for the period plus automatically going forward, with an annual true-up so the volume math is transparent both ways. ` +
    `${f.leverage}\n\n` +
    `Can your team send a corrected tiered pricing matrix ${deadlineLine(f)}?` +
    sign(),
});

const earlyPay: Builder = (f) => ({
  subject: `${f.vendorName} – formalizing early-pay discount terms`,
  body:
    `Hi ${f.vendorName} team,\n\n` +
    `We're able to pay ${f.vendorName} invoices on an accelerated schedule and want to make sure we capture the early-payment terms already available. ${f.summary}` +
    evidenceBlock(f) +
    `\n\nWe'd like to ${ask(f)} — guaranteed payment within the discount window in exchange for the stated discount, which is materially faster cash to you. ` +
    `${f.leverage}\n\n` +
    `Can we formalize this on the next order form ${deadlineLine(f)}?` +
    sign(),
});

/** Select the right template for a finding (special-cases R07 volume / R08 early-pay). */
export function selectBuilder(f: Finding): Builder {
  if (f.ruleId === "R07") return volume;
  if (f.ruleId === "R08") return earlyPay;
  switch (f.category) {
    case "auto_renewal":
      return autoRenewal;
    case "rate_mismatch":
    case "overbilling":
    case "duplicate":
      return overcharge;
    case "unused_seats":
    case "tier_optimization":
    case "minimum_commit":
      return rightSizing;
    case "price_escalator":
      return escalator;
    case "missed_discount":
      return earlyPay;
    default:
      return overcharge;
  }
}

/**
 * Turn a revenue finding into a ready-to-send CUSTOMER notice — the seller-side
 * inverse of ../../email/draft. The action and tone are graded by relationship
 * risk: a clean, in-window finding (A) gets a corrected invoice with the arrears
 * claimed; a slow-burn one (B) gets a collaborative reconciliation; a delicate
 * one (C) gets a forward-only price-adjustment notice with NO retroactive ask.
 * The clause is always cited.
 */
import { EmailDraftSchema, type EmailDraft } from "../../types";
import type { RevenueFinding } from "../types";
import { slug } from "../../docmodel/serialize";
import { formatUSD } from "../../money";
import { formatLong } from "../../dates";

const SENDER = {
  company: "Northwind Logistics Group, Inc.",
  name: "Jordan Avery",
  title: "VP, Finance",
  email: "billing@northwindlogistics.com",
} as const;

function customerInbox(customerName: string): string {
  return `accountspayable@${slug(customerName).replace(/-/g, "")}.com`;
}

function evidenceBlock(f: RevenueFinding): string {
  const rows = f.evidence.slice(0, 4).map((e) => `  • ${e.label}: ${e.value}`);
  return rows.length ? `\n\nWhat the contract and billing show:\n${rows.join("\n")}` : "";
}

function clauseLine(f: RevenueFinding): string {
  return f.clauseCited ? ` under the "${f.clauseCited}" provision` : "";
}

function sign(): string {
  return `\n\nKind regards,\n${SENDER.name}\n${SENDER.title}, ${SENDER.company}\n${SENDER.email}`;
}

const ask = (f: RevenueFinding) =>
  f.recommendedAsk ?? "a corrected go-forward rate and settlement of the amounts owed to date";

interface DraftParts {
  subject: string;
  body: string;
}

/** A — retroactive claim: corrected invoice + arrears, citing the audit right. */
function retroactive(f: RevenueFinding): DraftParts {
  return {
    subject: `Billing correction & adjustment invoice — ${formatUSD(f.totalRecoverableCents)} — ${f.customerName}`,
    body:
      `Dear ${f.customerName} Accounts Payable,\n\n` +
      `In a reconciliation of your account against our agreement we identified an amount that was under-billed${clauseLine(f)}. ${f.summary}` +
      evidenceBlock(f) +
      `\n\nAccordingly we are issuing a corrected invoice: ${formatUSD(f.arrearsToDateCents)} in arrears to date` +
      (f.annualizedUpliftCents > 0
        ? `, and the rate is corrected going forward (an additional ${formatUSD(f.annualizedUpliftCents)}/yr).`
        : `.`) +
      ` ${ask(f)}. ${f.leverage}\n\n` +
      `We'd be glad to walk your team through the calculation under the contract's audit-records provision. Please confirm by ${f.deadlineDate ? formatLong(f.deadlineDate) : "return"}.` +
      sign(),
  };
}

/** B — negotiate partial: correct forward, reconcile the in-window arrears collaboratively. */
function negotiate(f: RevenueFinding): DraftParts {
  return {
    subject: `Pricing reconciliation — ${f.customerName} — corrected rate going forward`,
    body:
      `Dear ${f.customerName} team,\n\n` +
      `We value the partnership, and in reviewing your account we found the billing has drifted from the agreed terms${clauseLine(f)}. ${f.summary}` +
      evidenceBlock(f) +
      `\n\nWe'd like to correct the rate going forward` +
      (f.annualizedUpliftCents > 0 ? ` (+${formatUSD(f.annualizedUpliftCents)}/yr to the contracted level)` : ``) +
      ` and discuss a fair settlement of the in-window difference (${formatUSD(f.arrearsToDateCents)} to date). ${ask(f)}. ${f.leverage}\n\n` +
      `We'd rather resolve this collaboratively than invoke the formal audit clause. Could we set up a short call this week?` +
      sign(),
  };
}

/** C — forward only: a price-adjustment notice, no arrears claimed. */
function forwardOnly(f: RevenueFinding): DraftParts {
  return {
    subject: `Price adjustment notice — ${f.customerName}${f.deadlineDate ? ` — effective ${formatLong(f.deadlineDate)}` : ""}`,
    body:
      `Dear ${f.customerName} team,\n\n` +
      `As part of our annual account review we're writing to align your billing with the current agreed terms${clauseLine(f)}. ${f.summary}` +
      evidenceBlock(f) +
      `\n\nEffective ${f.deadlineDate ? formatLong(f.deadlineDate) : "from the next billing cycle"}, the rate will be corrected to the contracted level` +
      (f.annualizedUpliftCents > 0 ? ` (an adjustment of ${formatUSD(f.annualizedUpliftCents)}/yr)` : ``) +
      `. There is no retroactive charge — this notice simply brings the go-forward billing into line. ${f.leverage}\n\n` +
      `Please let us know if you have any questions; we're happy to review the underlying calculation together.` +
      sign(),
  };
}

export function draftRevenueEmail(f: RevenueFinding): EmailDraft {
  const builder =
    f.recommendedAction === "retroactive_claim"
      ? retroactive
      : f.recommendedAction === "negotiate_partial"
        ? negotiate
        : forwardOnly;
  const { subject, body } = builder(f);
  return EmailDraftSchema.parse({
    findingId: f.id,
    vendorName: f.customerName, // EmailDraft.vendorName carries the counterparty name
    to: customerInbox(f.customerName),
    subject,
    body,
    category: f.category,
  });
}

/** Draft customer notices for the top-N ranked findings. */
export function draftRevenueEmailsForTop(
  findings: RevenueFinding[],
  n = 10,
): EmailDraft[] {
  return findings.slice(0, n).map(draftRevenueEmail);
}

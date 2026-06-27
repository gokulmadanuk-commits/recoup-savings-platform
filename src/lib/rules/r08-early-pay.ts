/**
 * R08 — Missed Early-Pay Discount.
 *
 * Finds invoices carrying an early-pay discount (e.g. 2/10 Net 30) that AP paid
 * after the discount window closed, forfeiting the discount on every one. We
 * read the discount terms off the invoice (falling back to the contract's
 * payment terms), compare the actual pay date against invoiceDate + discountDays,
 * and total the forfeited discount.
 *
 *   missedDiscount(invoice) = round(invoiceTotal * discountPct)
 *   recoverableToDate       = sum of missedDiscount over every late+discounted invoice
 *   annualizedSavings       = 12 * missedDiscount(most-recent monthly invoice)   (run-rate forward)
 *
 * Pure recovery: the cash was already left on the table and is recoverable as a
 * retroactive credit (plus a go-forward AP fix). Only fires where there is a
 * real discount AND at least one late payment.
 */
import { perVendorRule, makeFinding, type Rule } from "./types";
import { daysBetween } from "../dates";
import { formatUSD, formatUSDPrecise, formatPct } from "../money";
import type { Invoice, Evidence, PaymentTerm } from "../types";

const RULE_ID = "R08";
const RULE_NAME = "Missed Early-Pay Discount";

/** Discount terms governing an invoice: the invoice's own terms, else the contract's. */
function discountTermsFor(inv: Invoice, contractTerms: PaymentTerm | null): PaymentTerm | null {
  if (inv.paymentTerms && inv.paymentTerms.discountPct > 0) return inv.paymentTerms;
  if (contractTerms && contractTerms.discountPct > 0) return contractTerms;
  return null;
}

const rule: Rule = perVendorRule(
  RULE_ID,
  RULE_NAME,
  "missed_discount",
  (vendor) => {
    const contractTerms = vendor.contract?.payment ?? null;

    // An invoice is a "miss" when it has a discount, a known pay date, and that
    // pay date is after the discount deadline (invoiceDate + discountDays).
    interface Miss {
      inv: Invoice;
      terms: PaymentTerm;
      missedCents: number;
      payGap: number; // days from invoice date to actual pay date
    }

    const misses: Miss[] = [];
    for (const inv of vendor.invoices) {
      const terms = discountTermsFor(inv, contractTerms);
      if (!terms) continue;
      if (!inv.actualPayDate) continue;
      const payGap = daysBetween(inv.invoiceDate, inv.actualPayDate);
      if (payGap <= terms.discountDays) continue; // paid within the window — discount captured
      const missedCents = Math.round(inv.totalCents * terms.discountPct);
      if (missedCents <= 0) continue;
      misses.push({ inv, terms, missedCents, payGap });
    }

    if (misses.length === 0) return [];

    // Recoverable to date: every forfeited discount across the observed year.
    const recoverableToDateCents = misses.reduce((a, m) => a + m.missedCents, 0);

    // Forward run-rate: the discount on the current (most recent) monthly invoice
    // annualized over 12 months — reflects the rate AP is currently bleeding.
    const latest = misses.reduce((a, b) =>
      daysBetween(a.inv.invoiceDate, b.inv.invoiceDate) >= 0 ? b : a,
    );
    const annualizedSavingsCents = latest.missedCents * 12;

    const terms = latest.terms;
    const discPct = terms.discountPct;
    const netDays = terms.netDays;
    const discDays = terms.discountDays;
    // Implied APR of skipping the discount: disc/(1-disc) * 365/(net-discDays).
    const apr =
      netDays > discDays
        ? (discPct / (1 - discPct)) * (365 / (netDays - discDays))
        : 0;

    const termLabel = `${formatPct(discPct, 0)}/${discDays} Net ${netDays}`;

    const evidence: Evidence[] = [];
    evidence.push({
      label: "Payment terms",
      value: `${termLabel} — ${formatPct(discPct, 0)} early-pay discount if paid within ${discDays} days (net ${netDays}).`,
      sourceDoc: latest.inv.sourceDoc,
    });
    // Show the first few missed invoices as proof of a chronic pattern.
    for (const m of misses.slice(0, 4)) {
      const deadlineGap = m.payGap - m.terms.discountDays;
      evidence.push({
        label: `Invoice ${m.inv.invoiceNumber}`,
        value:
          `Total ${formatUSD(m.inv.totalCents)}; invoiced ${m.inv.invoiceDate}, ` +
          `paid ${m.inv.actualPayDate} (${m.payGap} days later — ${deadlineGap} days past the ${m.terms.discountDays}-day window). ` +
          `Forfeited discount ${formatUSDPrecise(m.missedCents)}.`,
        sourceDoc: m.inv.sourceDoc,
      });
    }
    evidence.push({
      label: "Forfeited to date",
      value: `${formatUSDPrecise(recoverableToDateCents)} across ${misses.length} invoices paid past the discount window.`,
      sourceDoc: null,
    });
    if (apr > 0) {
      evidence.push({
        label: "Implied cost of skipping",
        value: `Skipping ${termLabel} to pay ~${latest.payGap} days out is equivalent to borrowing at ${formatPct(apr, 1)} APR.`,
        sourceDoc: null,
      });
    }

    const finding = makeFinding({
      ruleId: RULE_ID,
      ruleName: RULE_NAME,
      category: "missed_discount",
      vendorId: vendor.vendor.id,
      vendorName: vendor.vendor.name,
      title: `Early-pay ${termLabel} discount forfeited on every invoice`,
      summary:
        `AP paid all ${misses.length} ${vendor.vendor.name} invoices ~${latest.payGap} days after the invoice date, ` +
        `past the ${discDays}-day early-pay window, forfeiting the ${formatPct(discPct, 0)} discount each time. ` +
        `That is ${formatUSDPrecise(recoverableToDateCents)} left on the table to date and ${formatUSD(annualizedSavingsCents)}/yr at the current run-rate.`,
      savingsType: "recovery",
      annualizedSavingsCents,
      recoverableToDateCents,
      confidence: 0.95,
      severity: "high",
      leverage:
        "Chronic early-pay misses are an internal AP timing fix worth a hard dollar figure. Quantify the back-period leakage to justify AP automation, and trade the corrected behaviour for dynamic-discounting terms (e.g. 2% at 5 days, 1.5% at 10).",
      evidence,
      recommendedAsk:
        `Request a retroactive credit of ${formatUSDPrecise(recoverableToDateCents)} for the ${misses.length} forfeited ${formatPct(discPct, 0)} discounts, and fix AP to pay within ${discDays} days going forward to capture ${formatUSD(annualizedSavingsCents)}/yr.`,
    });

    return [finding];
  },
);

export default rule;

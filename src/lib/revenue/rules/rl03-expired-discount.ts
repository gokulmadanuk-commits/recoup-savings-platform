/**
 * RL03 — Expired introductory discount still applied.
 *
 * The contract carries a time-boxed introductory/promotional discount with an
 * `expiryDate`. After that date the discount should drop off and billing should
 * revert to the gross list price, but the discount line keeps being applied. We
 * sum the wrongly-credited discount across every billing dated after expiry
 * (arrears = recovery) and annualise the per-month discount as the forward
 * run-rate gap (uplift = avoidance, until the bill is corrected).
 *
 * Guard against false positives: only fires when the intro discount has actually
 * expired (expiryDate < analysisDate) AND there are discount lines on billings
 * dated after the expiry. A contract whose post-expiry billings carry no discount
 * (the discount was correctly removed) yields nothing.
 */
import { perCustomerRule, makeRevenueFinding } from "./types";
import type { RevenueRule } from "./types";
import { formatUSD, formatPct } from "../../money";
import type { BillingDoc } from "../types";

const ID = "RL03";
const NAME = "Expired discount still applied";

/** Total of all discount-line credits on a billing doc (returned as a positive magnitude). */
function discountMagnitudeCents(doc: BillingDoc): number {
  return doc.lines
    .filter((l) => l.lineType === "discount")
    .reduce((a, l) => a + Math.abs(l.lineTotalCents), 0);
}

export const rl03: RevenueRule = perCustomerRule(
  ID,
  NAME,
  "expired_discount",
  (record, ctx) => {
    const contract = record.contract;
    if (!contract || !contract.introDiscount) return [];

    const { expiryDate, pct } = contract.introDiscount;
    // Guard: the discount must actually be expired as of the analysis date.
    if (!(expiryDate < ctx.analysisDate)) return [];

    // Billings dated strictly after the expiry that still carry a discount line.
    const postExpiry = record.billings.filter(
      (b) => b.invoiceDate > expiryDate && discountMagnitudeCents(b) > 0,
    );
    // Guard: no post-expiry discount lines → billing is correct → no finding.
    if (postExpiry.length === 0) return [];

    // Arrears = wrongly-given discount summed over the post-expiry months.
    const arrears = postExpiry.reduce((a, b) => a + discountMagnitudeCents(b), 0);

    // Forward run-rate gap = the most recent post-expiry monthly discount × 12.
    const sorted = [...postExpiry].sort((a, b) =>
      a.invoiceDate.localeCompare(b.invoiceDate),
    );
    const monthlyDiscount = discountMagnitudeCents(sorted[sorted.length - 1]);
    const uplift = monthlyDiscount * 12;

    if (arrears + uplift < 100_00) return []; // immaterial (< $100)

    const firstAfter = sorted[0];
    const months = postExpiry.length;

    return [
      makeRevenueFinding({
        ruleId: ID,
        ruleName: NAME,
        category: "expired_discount",
        customerId: record.customer.id,
        customerName: record.customer.name,
        title: `Introductory ${formatPct(pct, 0)} discount still applied ${months} months past expiry (${expiryDate})`,
        summary: `The ${formatPct(pct, 0)} introductory discount expired ${expiryDate} but billing has continued to apply a discount line on every invoice since — ${months} post-expiry months totalling ${formatUSD(arrears)} of credit that was no longer contractually owed. The list price should have been restored at expiry.`,
        arrearsToDateCents: arrears,
        annualizedUpliftCents: uplift,
        confidence: 0.95,
        severity: arrears + uplift >= 250_000_00 ? "high" : "medium",
        leverage: `The Introductory Discount clause is expressly time-boxed to ${expiryDate}; every discount credited after that date is recoverable and the list price applies forward. The issue is recent and discrete (${months} months), so waiver/estoppel risk is minimal.`,
        evidence: [
          { label: "Discount", value: formatPct(pct, 0), sourceDoc: contract.sourceDoc },
          { label: "Expiry date", value: expiryDate, sourceDoc: contract.sourceDoc },
          { label: "Post-expiry months still discounted", value: String(months), sourceDoc: null },
          { label: "Monthly discount", value: formatUSD(monthlyDiscount), sourceDoc: firstAfter.sourceDoc },
          { label: "Total wrongly credited", value: formatUSD(arrears), sourceDoc: null },
        ],
        recommendedAsk: `Restore the list price forward (+${formatUSD(uplift)}/yr) and recover the ${formatUSD(arrears)} of discount credited across ${months} months after the ${expiryDate} expiry.`,
        clauseCited: "Introductory Discount (expiry)",
        deadlineDate: null,
        risk: {
          // Strong, explicit entitlement; recent & in-window → grade A.
          entitlement: 0.9,
          auditWindow: 1.0,
          waiverEstoppel: 0.9,
          relationship: 0.6,
        },
      }),
    ];
  },
);

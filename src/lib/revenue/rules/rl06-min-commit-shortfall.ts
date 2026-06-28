/**
 * RL06 — Minimum-commitment / take-or-pay shortfall never invoiced.
 *
 * The contract carries an annual take-or-pay floor (commitment.minCommitSpendCents
 * with measurementPeriod "annual"): the customer owes the seller AT LEAST that much
 * each measurement year regardless of actual consumption. When the trailing-12-month
 * billed spend lands below the floor and the gap was never trued-up, the difference
 * is an unbilled, contractually-owed shortfall:
 *   arrears = minCommit − trailing-12-month billed   (one-time recovery)
 *   uplift  = 0                                       (true-up, not a run-rate change)
 * Take-or-pay is a strong, unambiguous entitlement and the shortfall is a recent,
 * discrete annual event → relationship-risk grade A (retroactive true-up).
 *
 * Guard against false positives: only fires when billed spend is demonstrably BELOW
 * the floor (beyond a rate tolerance). A customer that met or exceeded its minimum
 * yields nothing.
 */
import { perCustomerRule, makeRevenueFinding } from "./types";
import type { RevenueRule } from "./types";
import { auditWindowAxis, waiverEstoppelAxis } from "./risk";
import { formatUSD } from "../../money";
import { addMonths } from "../../dates";
import type { BillingDoc } from "../types";

const ID = "RL06";
const NAME = "Minimum-commitment shortfall";

/**
 * Spend billed toward the commitment over the trailing 12 months: the sum of
 * chargeable line totals (excludes tax / credits / discounts — those don't
 * represent commitment consumption) on invoices dated within the window.
 */
function trailingBilledSpendCents(
  billings: BillingDoc[],
  analysisDate: string,
): number {
  const cutoff = addMonths(analysisDate, -12);
  return billings
    .filter((b) => b.invoiceDate >= cutoff && b.invoiceDate <= analysisDate)
    .reduce(
      (sum, b) =>
        sum +
        b.lines
          .filter(
            (l) =>
              l.lineType !== "tax" &&
              l.lineType !== "credit" &&
              l.lineType !== "discount",
          )
          .reduce((a, l) => a + l.lineTotalCents, 0),
      0,
    );
}

export const rl06: RevenueRule = perCustomerRule(
  ID,
  NAME,
  "min_commit_shortfall",
  (record, ctx) => {
    const contract = record.contract;
    if (!contract || !contract.commitment) return [];

    const minCommit = contract.commitment.minCommitSpendCents;
    // Only annual take-or-pay floors are in scope for this rule.
    if (minCommit === null || minCommit <= 0) return [];
    if (contract.commitment.measurementPeriod !== "annual") return [];

    const billed = trailingBilledSpendCents(record.billings, ctx.analysisDate);
    // Need real billing history to assert a shortfall.
    if (billed <= 0) return [];

    // Guard: billed must be demonstrably BELOW the floor (beyond rate tolerance).
    const tol = Math.round(minCommit * ctx.config.rateTolerancePct);
    if (billed >= minCommit - tol) return [];

    const arrears = minCommit - billed; // unbilled take-or-pay shortfall
    const uplift = 0; // a one-time true-up, not a forward run-rate change
    if (arrears < 100_00) return []; // immaterial (< $100)

    // The shortfall is a discrete, recent annual event (one measurement year),
    // so waiver/estoppel risk is low and the whole gap sits inside the audit
    // window — this drives the audit-window / waiver axes below.
    const shortfallMonths = 12; // a single annual measurement period
    const annual = contract.currentAnnualValueCents;
    const relationship = annual >= 1_000_000_00 ? 0.45 : annual >= 250_000_00 ? 0.55 : 0.7;

    return [
      makeRevenueFinding({
        ruleId: ID,
        ruleName: NAME,
        category: "min_commit_shortfall",
        customerId: record.customer.id,
        customerName: record.customer.name,
        title: `Take-or-pay minimum shortfall never invoiced — ${formatUSD(arrears)} under the ${formatUSD(minCommit)} annual floor`,
        summary: `The agreement carries an annual take-or-pay minimum of ${formatUSD(minCommit)}, but only ${formatUSD(billed)} was billed over the trailing 12 months. The ${formatUSD(arrears)} shortfall is owed under the minimum-commitment clause and was never invoiced.`,
        arrearsToDateCents: arrears,
        annualizedUpliftCents: uplift,
        confidence: 0.95,
        severity: arrears >= 250_000_00 ? "high" : "medium",
        leverage: `The Minimum Commitment (take-or-pay) clause obligates the customer to pay at least ${formatUSD(minCommit)} per measurement year regardless of usage; the entitlement is unconditional. Audit rights cover the last ${contract.auditWindowMonths} months — the entire shortfall is in-window.`,
        evidence: [
          { label: "Annual minimum commitment", value: formatUSD(minCommit), sourceDoc: contract.sourceDoc },
          { label: "Trailing-12-month billed", value: formatUSD(billed), sourceDoc: record.billings[0]?.sourceDoc ?? null },
          { label: "Unbilled shortfall", value: formatUSD(arrears), sourceDoc: null },
          { label: "Measurement period", value: contract.commitment.measurementPeriod, sourceDoc: contract.sourceDoc },
        ],
        recommendedAsk: `Issue a true-up invoice for the ${formatUSD(arrears)} take-or-pay shortfall under the Minimum Commitment clause (audit right covers the last ${contract.auditWindowMonths} months; the full gap is in-window).`,
        clauseCited: "Minimum Commitment (take-or-pay)",
        deadlineDate: null,
        risk: {
          entitlement: 0.95,
          auditWindow: auditWindowAxis(shortfallMonths, contract.auditWindowMonths),
          waiverEstoppel: waiverEstoppelAxis(shortfallMonths),
          relationship,
        },
      }),
    ];
  },
);

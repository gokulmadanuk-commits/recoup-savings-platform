/**
 * RL05 — Unbilled usage / overage above the included allowance.
 *
 * The contract bundles an included allowance (e.g. 8,000 cu-ft of bonded
 * storage) and entitles the seller to bill consumption above it at a contracted
 * overage rate. Metered usage shows the customer consistently runs over the
 * allowance, but no overage line was raised. We measure the per-month excess
 * (used − includedAllowance), price it at the overage rate, net off any overage
 * already billed, and sum across the billed months: arrears = Σ unbilled excess;
 * uplift = the current monthly overage annualised (the forward run-rate gap).
 *
 * Guard against false positives: only fires when metered usage genuinely exceeds
 * the allowance AND the billed overage falls short of the entitlement. A
 * customer billed within the allowance, or already billed for the full excess,
 * yields nothing.
 */
import { perCustomerRule, makeRevenueFinding } from "./types";
import type { RevenueRule } from "./types";
import { auditWindowAxis, waiverEstoppelAxis } from "./risk";
import { formatUSD, formatQty } from "../../money";
import type { BillingDoc } from "../types";

const ID = "RL05";
const NAME = "Unbilled overage above allowance";

/** Metered units consumed in a billing doc (the `usage` line qty). */
function usageUnits(billing: BillingDoc): number | null {
  const usage = billing.lines.filter((l) => l.lineType === "usage");
  if (usage.length === 0) return null;
  return usage.reduce((a, l) => a + l.qty, 0);
}

/** Overage already billed in a billing doc, in cents. */
function billedOverageCents(billing: BillingDoc): number {
  return billing.lines
    .filter((l) => l.lineType === "overage")
    .reduce((a, l) => a + l.lineTotalCents, 0);
}

export const rl05: RevenueRule = perCustomerRule(
  ID,
  NAME,
  "unbilled_usage",
  (record, ctx) => {
    const contract = record.contract;
    const commitment = contract?.commitment;
    if (!contract || !commitment) return [];

    const allowance = commitment.includedAllowance;
    const overageRate = commitment.overageUnitPriceCents;
    // Only an allowance-with-overage-rate commitment can leak this way.
    if (allowance === null || overageRate === null || overageRate <= 0)
      return [];

    // Per-billing-doc: excess over allowance, the overage owed, and what was billed.
    let arrears = 0;
    let monthsOver = 0;
    let lastExcess = 0;
    let totalUsed = 0;
    let billedMonths = 0;

    for (const billing of record.billings) {
      const used = usageUnits(billing);
      if (used === null) continue; // no metered usage on this doc
      billedMonths += 1;
      totalUsed += used;
      const excess = used - allowance;
      if (excess <= 0) continue; // within allowance this month
      const owed = Math.round(excess * overageRate);
      const billed = billedOverageCents(billing);
      const shortfall = owed - billed;
      // Guard: an overage line already covering the excess leaves nothing.
      if (shortfall <= 0) continue;
      arrears += shortfall;
      monthsOver += 1;
      lastExcess = excess;
    }

    if (billedMonths === 0 || monthsOver === 0) return [];

    // Immaterial (< $100): not worth a corrected invoice.
    if (arrears < 100_00) return [];

    // Forward run-rate gap: the current monthly overage, annualised.
    const monthlyOverage = Math.round(lastExcess * overageRate);
    const uplift = monthlyOverage * 12;

    const avgUsed = Math.round(totalUsed / billedMonths);
    const annual = contract.currentAnnualValueCents;
    const relationship =
      annual >= 1_000_000_00 ? 0.4 : annual >= 250_000_00 ? 0.5 : 0.65;

    // Recent, ongoing meter-vs-bill gap → clean to claim (auditWindow ~1, low
    // waiver/estoppel risk): months over is small and well inside the audit window.
    const auditWindow = auditWindowAxis(monthsOver, contract.auditWindowMonths);
    const waiverEstoppel = Math.max(waiverEstoppelAxis(monthsOver), 0.9);

    return [
      makeRevenueFinding({
        ruleId: ID,
        ruleName: NAME,
        category: "unbilled_usage",
        customerId: record.customer.id,
        customerName: record.customer.name,
        title: `Overage above the ${formatQty(allowance)}-unit allowance never billed — ${formatQty(lastExcess)} units/mo unbilled`,
        summary: `Metered usage averages ${formatQty(avgUsed)} units/mo against a bundled allowance of ${formatQty(allowance)} units, but no overage line was raised. The contracted overage rate of ${formatUSD(overageRate)}/unit applies to the ${formatQty(lastExcess)}-unit monthly excess — ${formatUSD(monthlyOverage)}/mo (${formatUSD(uplift)}/yr) that has gone unbilled across ${monthsOver} month${monthsOver === 1 ? "" : "s"}.`,
        arrearsToDateCents: arrears,
        annualizedUpliftCents: uplift,
        confidence: 0.92,
        severity: arrears + uplift >= 250_000_00 ? "high" : "medium",
        leverage: `The Overage / Excess-Usage clause entitles ${ctx.dataset.seller} to bill consumption above the ${formatQty(allowance)}-unit allowance at ${formatUSD(overageRate)}/unit. Metered usage is the seller's own record, so the excess is unambiguous; audit rights cover the last ${contract.auditWindowMonths} months.`,
        evidence: [
          { label: "Included allowance", value: `${formatQty(allowance)} units`, sourceDoc: contract.sourceDoc },
          { label: "Avg metered usage", value: `${formatQty(avgUsed)} units/mo`, sourceDoc: record.billings[0]?.sourceDoc ?? null },
          { label: "Monthly excess", value: `${formatQty(lastExcess)} units`, sourceDoc: null },
          { label: "Overage rate", value: `${formatUSD(overageRate)}/unit`, sourceDoc: contract.sourceDoc },
          { label: "Months unbilled", value: String(monthsOver), sourceDoc: null },
        ],
        recommendedAsk: `Raise the unbilled overage (${formatUSD(arrears)} to date across ${monthsOver} months) and bill the overage line going forward at ${formatUSD(monthlyOverage)}/mo (+${formatUSD(uplift)}/yr).`,
        clauseCited: "Overage / Excess-Usage charges",
        deadlineDate: null,
        risk: {
          entitlement: 0.9,
          auditWindow,
          waiverEstoppel,
          relationship,
        },
      }),
    ];
  },
);

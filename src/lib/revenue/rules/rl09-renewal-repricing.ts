/**
 * RL09 — Auto-renewal repriced at the old rate (evergreen).
 *
 * An evergreen / auto-renewing contract rolled over, and the rate card's
 * currently-effective list price stepped up on the renewal date — but billing
 * kept running at the PRE-renewal rate. We key strictly off the rate card's
 * currently-effective unit price (the latest line whose effectiveFrom <= analysis
 * date) versus the recurring price actually billed on/after that renewal date:
 *   arrears = (list − billed) × post-renewal billed months   (recovery)
 *   uplift  = (list − billed) × 12                            (forward avoidance)
 *
 * This is NOT an escalator (RL01) and NOT a scheduled price step
 * (priceIncreaseSchedule / RL02) — both are deliberately ignored. The signal is
 * purely: autoRenew true + a rate-card repricing at renewal + billing that never
 * caught up.
 *
 * Guard against false positives: fires ONLY when (a) the contract auto-renews,
 * (b) the rate card actually repriced upward (a prior, lower-priced line exists),
 * and (c) the recurring price billed after the renewal is materially below the
 * current list price. A contract already billing at the current list price yields
 * nothing.
 */
import { perCustomerRule, makeRevenueFinding } from "./types";
import type { RevenueRule } from "./types";
import { auditWindowAxis, waiverEstoppelAxis } from "./risk";
import { formatUSD, formatUSDPrecise } from "../../money";
import { monthsBetween } from "../../dates";
import type { CustomerContract, BillingDoc } from "../types";
import type { RateCardLine } from "../../types";

const ID = "RL09";
const NAME = "Auto-renewal repriced at the old rate";

/**
 * The rate-card line in force as of `asOf`: the latest line whose effectiveFrom
 * is on/before `asOf` (a null effectiveFrom is treated as always-effective from
 * the dawn of time). Returns null if no recurring rate-card line qualifies.
 */
function currentRateCardLine(
  rateCard: RateCardLine[],
  asOf: string,
): RateCardLine | null {
  const eligible = rateCard.filter(
    (l) => l.effectiveFrom === null || l.effectiveFrom <= asOf,
  );
  if (eligible.length === 0) return null;
  return eligible.reduce((best, l) => {
    const a = l.effectiveFrom ?? "0000-00-00";
    const b = best.effectiveFrom ?? "0000-00-00";
    return a >= b ? l : best;
  });
}

/** The latest rate-card line strictly BEFORE the current one's effectiveFrom. */
function priorRateCardLine(
  rateCard: RateCardLine[],
  current: RateCardLine,
): RateCardLine | null {
  const cutoff = current.effectiveFrom;
  if (cutoff === null) return null;
  const earlier = rateCard.filter(
    (l) => l !== current && l.effectiveFrom !== null && l.effectiveFrom < cutoff,
  );
  if (earlier.length === 0) return null;
  return earlier.reduce((best, l) =>
    (l.effectiveFrom ?? "") >= (best.effectiveFrom ?? "") ? l : best,
  );
}

/** Recurring billing docs invoiced on/after the renewal date, newest-relevant first. */
function postRenewalRecurring(
  billings: BillingDoc[],
  renewalDate: string,
): { unitPriceCents: number; count: number; firstDoc: BillingDoc | null } {
  const docs = billings
    .filter((b) => b.invoiceDate >= renewalDate)
    .map((b) => ({
      doc: b,
      recurring: b.lines.filter((l) => l.lineType === "recurring"),
    }))
    .filter((x) => x.recurring.length > 0);
  if (docs.length === 0)
    return { unitPriceCents: 0, count: 0, firstDoc: null };
  // Most-common recurring unit price billed post-renewal (the prevailing rate).
  const prices = docs.flatMap((x) => x.recurring.map((l) => l.unitPriceCents));
  const mode = prices
    .slice()
    .sort(
      (a, b) =>
        prices.filter((p) => p === b).length -
        prices.filter((p) => p === a).length,
    )[0];
  return {
    unitPriceCents: mode,
    count: docs.length,
    firstDoc: docs[0].doc,
  };
}

export const rl09: RevenueRule = perCustomerRule(
  ID,
  NAME,
  "renewal_repricing",
  (record, ctx) => {
    const contract = record.contract;
    if (!contract || !contract.autoRenew) return [];
    if (!contract.rateCard || contract.rateCard.length === 0) return [];

    // The list price in force today, and the renewal date that introduced it.
    const current = currentRateCardLine(contract.rateCard, ctx.analysisDate);
    if (!current || current.effectiveFrom === null) return [];
    const renewalDate = current.effectiveFrom;
    const listCents = current.unitPriceCents;

    // A repricing must actually have happened: a prior, distinct list price.
    const prior = priorRateCardLine(contract.rateCard, current);
    if (!prior) return [];
    if (listCents <= prior.unitPriceCents) return []; // not an upward reprice

    // What was actually billed (recurring) on/after the renewal.
    const billed = postRenewalRecurring(record.billings, renewalDate);
    if (billed.count === 0) return [];

    // Guard: already billing at (or above) the current list price → nothing.
    const tol = Math.max(
      ctx.config.rateToleranceMinCents,
      Math.round(listCents * ctx.config.rateTolerancePct),
    );
    if (billed.unitPriceCents >= listCents - tol) return [];

    const gapPerMonth = listCents - billed.unitPriceCents;
    const arrears = gapPerMonth * billed.count; // post-renewal months under-billed
    const uplift = gapPerMonth * 12; // forward annualised run-rate gap
    if (arrears + uplift < 100_00) return []; // immaterial (< $100)

    const monthsElapsed = monthsBetween(renewalDate, ctx.analysisDate);
    const annual = contract.currentAnnualValueCents;
    const relationship =
      annual >= 100_000_00 ? 0.4 : annual >= 500_000_00 ? 0.55 : 0.7;

    return [
      makeRevenueFinding({
        ruleId: ID,
        ruleName: NAME,
        category: "renewal_repricing",
        customerId: record.customer.id,
        customerName: record.customer.name,
        title: `Evergreen renewal billed at the old rate — list rose to ${formatUSD(listCents)}/mo on ${renewalDate}, still billing ${formatUSD(billed.unitPriceCents)}/mo`,
        summary: `The agreement auto-renewed on ${renewalDate} and the rate card's effective list price stepped up from ${formatUSD(prior.unitPriceCents)} to ${formatUSD(listCents)}/mo, but billing has continued at the pre-renewal ${formatUSD(billed.unitPriceCents)}/mo for ${billed.count} months. The recurring rate was never repriced to the renewal list.`,
        arrearsToDateCents: arrears,
        annualizedUpliftCents: uplift,
        confidence: 0.92,
        severity: arrears + uplift >= 250_000_00 ? "high" : "medium",
        leverage: `The renewal carried the current rate card forward at ${formatUSD(listCents)}/mo (effective ${renewalDate}); billing kept the lapsed ${formatUSD(prior.unitPriceCents)} rate. The gap is recent (${billed.count} months), well inside the ${contract.auditWindowMonths}-month audit window, so the correction is clean.`,
        evidence: [
          { label: "Current list price (rate card)", value: `${formatUSDPrecise(listCents)}/mo`, sourceDoc: contract.sourceDoc },
          { label: "Renewal effective date", value: renewalDate, sourceDoc: contract.sourceDoc },
          { label: "Pre-renewal list price", value: `${formatUSDPrecise(prior.unitPriceCents)}/mo`, sourceDoc: contract.sourceDoc },
          { label: "Currently billed", value: `${formatUSDPrecise(billed.unitPriceCents)}/mo`, sourceDoc: billed.firstDoc?.sourceDoc ?? null },
          { label: "Months under-billed", value: String(billed.count), sourceDoc: null },
        ],
        recommendedAsk: `Reprice forward to the renewal list of ${formatUSD(listCents)}/mo (+${formatUSD(uplift)}/yr) and recover the ${billed.count} months billed at the lapsed rate (${formatUSD(arrears)} to date; well within the ${contract.auditWindowMonths}-month audit window).`,
        clauseCited: "Auto-Renewal / Rate Card (renewal pricing)",
        deadlineDate: null,
        risk: {
          entitlement: 0.95,
          auditWindow: auditWindowAxis(monthsElapsed, contract.auditWindowMonths),
          waiverEstoppel: waiverEstoppelAxis(monthsElapsed),
          relationship,
        },
      }),
    ];
  },
);

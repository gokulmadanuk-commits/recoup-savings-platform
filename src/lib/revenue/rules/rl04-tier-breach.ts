/**
 * RL04 — Tier breach (graduated-tier under-billing).
 *
 * The contract prices volume on a GRADUATED tier schedule: pallets up to the
 * first break carry the base rate, pallets above it carry a higher
 * premium-capacity rate. When volume blows past a tier break but billing applies
 * the lower base rate flat across the whole quantity, every billed month is
 * under-charged by the slice that should have priced at the premium rate.
 *
 * We recompute the correct graduated charge from the billed quantity and the
 * contract tiers, compare it to what was actually billed, and reconcile:
 *   arrears = Σ per-month under-billing over COMPLETED billed months
 *             (period end on/before the analysis date)
 *   uplift  = current monthly gap × 12 (forward annualised run-rate)
 *
 * Guard against false positives: only fires when the billed amount is strictly
 * below the graduated calc. A customer whose volume stays inside the first tier,
 * or who is already billed on the graduated schedule, yields nothing.
 */
import { perCustomerRule, makeRevenueFinding } from "./types";
import type { RevenueRule } from "./types";
import { auditWindowAxis, waiverEstoppelAxis } from "./risk";
import { formatUSD, formatQty } from "../../money";
import { monthsBetween } from "../../dates";
import type { CustomerContract, BillingDoc } from "../types";
import type { TieredRate } from "../../types";

const ID = "RL04";
const NAME = "Tier under-billed";

/** Line types that represent the metered volume the tiers price. */
const VOLUME_LINE_TYPES = new Set(["usage", "overage", "recurring"]);

/** Correct graduated charge for `qty` units across an ascending tier schedule. */
function graduatedChargeCents(qty: number, tiers: TieredRate[]): number {
  const sorted = [...tiers].sort((a, b) => a.tierMin - b.tierMin);
  let charge = 0;
  for (const t of sorted) {
    const lo = t.tierMin;
    const hi = t.tierMax ?? Infinity;
    if (qty <= lo) continue;
    const unitsInTier = Math.min(qty, hi) - lo;
    if (unitsInTier <= 0) continue;
    charge += Math.round(t.unitPriceCents * unitsInTier) + t.baseFeeCents;
  }
  return charge;
}

/** The single volume line on a billing doc (qty + billed total), or null. */
function volumeLine(doc: BillingDoc): { qty: number; billedCents: number } | null {
  const lines = doc.lines.filter((l) => VOLUME_LINE_TYPES.has(l.lineType) && l.qty > 0);
  if (lines.length === 0) return null;
  const qty = lines.reduce((a, l) => a + l.qty, 0);
  const billedCents = lines.reduce((a, l) => a + l.lineTotalCents, 0);
  return { qty, billedCents };
}

export const rl04: RevenueRule = perCustomerRule(
  ID,
  NAME,
  "tier_breach",
  (record, ctx) => {
    const contract = record.contract;
    if (!contract || contract.tiers.length < 2) return [];

    // The schedule must actually be graduated (a higher rate above some break).
    const tiers = [...contract.tiers].sort((a, b) => a.tierMin - b.tierMin);
    const baseTier = tiers[0];
    const topTier = tiers[tiers.length - 1];
    if (topTier.unitPriceCents <= baseTier.unitPriceCents) return [];
    const breakAt = baseTier.tierMax;
    if (breakAt == null) return [];

    // Completed billed months: period end on/before the analysis date.
    const completed = record.billings.filter(
      (b) => (b.billingPeriodEnd ?? b.invoiceDate) <= ctx.analysisDate,
    );
    if (completed.length === 0) return [];

    const tol = ctx.config.rateToleranceMinCents;
    let arrearsCents = 0;
    let monthsUnderBilled = 0;
    let lastGap = 0;
    let lastQty = 0;
    let lastBilled = 0;
    let lastCorrect = 0;

    for (const doc of completed) {
      const vol = volumeLine(doc);
      if (!vol) continue;
      // Only a breach if volume actually exceeded the first tier break.
      if (vol.qty <= breakAt) continue;
      const correctCents = graduatedChargeCents(vol.qty, tiers);
      const gap = correctCents - vol.billedCents;
      if (gap <= tol) continue; // billed correctly (or above) → no leakage this month
      arrearsCents += gap;
      monthsUnderBilled += 1;
      lastGap = gap;
      lastQty = vol.qty;
      lastBilled = vol.billedCents;
      lastCorrect = correctCents;
    }

    if (monthsUnderBilled === 0 || lastGap <= 0) return [];

    const upliftCents = lastGap * 12; // forward annualised run-rate gap
    if (arrearsCents + upliftCents < 100_00) return []; // immaterial (< $100)

    // Recent/discrete under-billing → clean retroactive claim (grade A).
    const monthsElapsed = monthsBetween(contract.effectiveDate, ctx.analysisDate);
    const annual = contract.currentAnnualValueCents;
    const relationship = annual >= 1_000_000_00 ? 0.4 : annual >= 250_000_00 ? 0.5 : 0.65;

    const baseRate = baseTier.unitPriceCents;
    const premiumRate = topTier.unitPriceCents;
    const overUnits = lastQty - breakAt;

    return [
      makeRevenueFinding({
        ruleId: ID,
        ruleName: NAME,
        category: "tier_breach",
        customerId: record.customer.id,
        customerName: record.customer.name,
        title: `Graduated tier breached — premium-capacity rate never billed above ${formatQty(breakAt)} units`,
        summary: `Volume runs at ${formatQty(lastQty)} units/mo, but billing applies the base rate of ${formatUSD(baseRate)} flat across the whole quantity. The ${formatQty(overUnits)} units above the ${formatQty(breakAt)}-unit break should price at ${formatUSD(premiumRate)}. Correct graduated charge is ${formatUSD(lastCorrect)}/mo vs. ${formatUSD(lastBilled)} billed — under by ${formatUSD(lastGap)}/mo across ${monthsUnderBilled} completed months.`,
        arrearsToDateCents: arrearsCents,
        annualizedUpliftCents: upliftCents,
        confidence: 0.95,
        severity: arrearsCents + upliftCents >= 250_000_00 ? "high" : "medium",
        leverage: `The graduated tier schedule entitles ${ctx.dataset.seller} to bill ${formatUSD(premiumRate)} on volume above ${formatQty(breakAt)} units. The breach is recent and the over-tier volume is on the invoices, so the entitlement is unambiguous and well inside the ${contract.auditWindowMonths}-month audit window.`,
        evidence: [
          { label: "Billed quantity / mo", value: `${formatQty(lastQty)} units`, sourceDoc: completed[completed.length - 1]?.sourceDoc ?? null },
          { label: "Base rate (tier 1)", value: `${formatUSD(baseRate)} / unit (0–${formatQty(breakAt)})`, sourceDoc: contract.sourceDoc },
          { label: "Premium rate (tier 2)", value: `${formatUSD(premiumRate)} / unit (above ${formatQty(breakAt)})`, sourceDoc: contract.sourceDoc },
          { label: "Correct graduated charge", value: `${formatUSD(lastCorrect)} / mo`, sourceDoc: null },
          { label: "Actually billed", value: `${formatUSD(lastBilled)} / mo`, sourceDoc: completed[completed.length - 1]?.sourceDoc ?? null },
          { label: "Monthly under-billing", value: formatUSD(lastGap), sourceDoc: null },
          { label: "Completed months under-billed", value: String(monthsUnderBilled), sourceDoc: null },
        ],
        recommendedAsk: `Re-rate forward to the graduated schedule (${formatUSD(lastCorrect)}/mo, +${formatUSD(upliftCents)}/yr) and recover the in-window arrears of ${formatUSD(arrearsCents)} across the last ${monthsUnderBilled} months under the Volume Tier Pricing clause.`,
        clauseCited: "Volume Tier Pricing (graduated rates)",
        deadlineDate: null,
        risk: {
          entitlement: 0.9,
          auditWindow: auditWindowAxis(Math.min(monthsUnderBilled, monthsElapsed), contract.auditWindowMonths),
          waiverEstoppel: monthsUnderBilled <= 12 ? 0.9 : waiverEstoppelAxis(monthsUnderBilled),
          relationship,
        },
      }),
    ];
  },
);

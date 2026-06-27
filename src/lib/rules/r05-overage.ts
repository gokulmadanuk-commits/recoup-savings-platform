/**
 * R05 — Overage / Usage-Tier Mismatch.
 *
 * Category: tier_optimization (avoidance).
 *
 * Finds vendors whose plan defines a bundled allowance
 * (`commitment.includedAllowance`) plus a punitive overage rate
 * (`commitment.overageUnitPriceCents`), where invoices repeatedly bill usage
 * above the allowance at that overage rate. Paying overage month after month is
 * almost always more expensive than buying up the base allowance, so the
 * avoidable spend is the reducible overage.
 *
 * Computation per measurement period (from invoice overage lines):
 *   overageUnits   = usage above the included allowance (the invoiced overage qty)
 *   overageSpend   = overageUnits * overageUnitPrice
 *   currentCost    = baseFee + overageSpend
 * If the contract publishes a higher-allowance buy-up tier (`contract.tiers`)
 * whose ceiling absorbs the actual usage, the alternative cost is that tier's
 * flat base fee and the avoidable amount is `currentCost - buyUpCost`. When no
 * explicit buy-up tier is published, the entire overage spend is the avoidable
 * figure (the ask is to fold that usage into a higher base allowance). The
 * per-period saving is annualized over the measurement period.
 */
import { perVendorRule, makeFinding, type RuleContext } from "./types";
import type { VendorRecord, Invoice, TieredRate } from "../types";
import { annualizeCents, formatUSD, formatUSDPrecise, formatQty } from "../money";
import type { BillingPeriod } from "../money";

const RULE_ID = "R05";
const RULE_NAME = "Overage / Usage-Tier Mismatch";

/** The dominant (modal) overage line across the invoice series for this plan. */
interface OverageObservation {
  overageUnits: number;
  overageUnitPriceCents: number;
  overageSpendPerPeriodCents: number;
  periods: number; // count of invoice periods exhibiting the overage
}

/** Pick the representative overage line: lineType === "overage", taken from the
 * most common (qty, unitPrice) pair across the invoice series. */
function observeOverage(invoices: Invoice[]): OverageObservation | null {
  const buckets = new Map<
    string,
    { units: number; priceCents: number; count: number }
  >();
  for (const inv of invoices) {
    for (const line of inv.lines) {
      if (line.lineType !== "overage") continue;
      if (line.qty <= 0) continue;
      const key = `${line.qty}|${line.unitPriceCents}`;
      const cur = buckets.get(key);
      if (cur) cur.count += 1;
      else
        buckets.set(key, {
          units: line.qty,
          priceCents: line.unitPriceCents,
          count: 1,
        });
    }
  }
  if (buckets.size === 0) return null;
  // The most frequently recurring overage line defines the steady-state plan.
  let best: { units: number; priceCents: number; count: number } | null = null;
  for (const b of buckets.values()) {
    if (!best || b.count > best.count) best = b;
  }
  if (!best) return null;
  return {
    overageUnits: best.units,
    overageUnitPriceCents: best.priceCents,
    overageSpendPerPeriodCents: Math.round(best.units * best.priceCents),
    periods: best.count,
  };
}

/** The cheapest published buy-up tier whose ceiling absorbs `usage`, strictly
 * above the base allowance, with the base tier it improves on. */
function findBuyUpTier(
  tiers: TieredRate[],
  includedAllowance: number,
  usage: number,
): { buyUp: TieredRate; base: TieredRate } | null {
  if (tiers.length < 2) return null;
  // Base tier: the one whose window contains the included allowance.
  const base =
    tiers.find(
      (t) =>
        t.tierMin <= includedAllowance &&
        (t.tierMax == null || t.tierMax >= includedAllowance),
    ) ?? null;
  if (!base) return null;
  // Candidate buy-up tiers: ceiling absorbs the actual usage and the base fee is
  // above the base tier's (a genuine allowance buy-up).
  const candidates = tiers.filter(
    (t) =>
      t !== base &&
      (t.tierMax == null || t.tierMax >= usage) &&
      t.tierMin > base.tierMin &&
      t.baseFeeCents > base.baseFeeCents,
  );
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => a.baseFeeCents - b.baseFeeCents);
  return { buyUp: candidates[0], base };
}

function evaluate(vendor: VendorRecord, _ctx: RuleContext) {
  const { contract, invoices } = vendor;
  if (!contract || !contract.commitment) return [];
  const commit = contract.commitment;
  if (commit.includedAllowance == null || commit.overageUnitPriceCents == null) {
    return [];
  }
  const includedAllowance = commit.includedAllowance;

  const obs = observeOverage(invoices);
  if (!obs || obs.overageUnits <= 0) return [];

  const period = (commit.measurementPeriod ?? "monthly") as BillingPeriod;
  const usage = includedAllowance + obs.overageUnits;
  const overageSpendPerPeriod = obs.overageSpendPerPeriodCents;

  // Does a published buy-up tier absorb this usage more cheaply?
  const buyUp = findBuyUpTier(contract.tiers, includedAllowance, usage);

  let savingPerPeriodCents: number;
  let buyUpNarrative: string;
  let askCents: number;
  if (buyUp) {
    // Current steady-state cost = base tier fee + overage spend.
    const currentCost = buyUp.base.baseFeeCents + overageSpendPerPeriod;
    const buyUpCost =
      buyUp.buyUp.baseFeeCents +
      Math.max(0, usage - (buyUp.buyUp.tierMin - 1)) *
        buyUp.buyUp.unitPriceCents;
    savingPerPeriodCents = currentCost - buyUpCost;
    const buyUpDelta = buyUp.buyUp.baseFeeCents - buyUp.base.baseFeeCents;
    buyUpNarrative =
      `A published buy-up tier (allowance up to ${formatQty(
        buyUp.buyUp.tierMax ?? usage,
      )}) costs a flat +${formatUSD(buyUpDelta)}/${period} over base and absorbs ` +
      `all ${formatQty(usage)} units, versus ${formatUSD(
        overageSpendPerPeriod,
      )}/${period} in overage today.`;
    askCents = savingPerPeriodCents;
  } else {
    // No published buy-up tier: the full overage spend is the avoidable figure
    // (fold the over-allowance usage into a higher base allowance).
    savingPerPeriodCents = overageSpendPerPeriod;
    buyUpNarrative =
      `No higher-allowance tier is published; the entire ${formatUSD(
        overageSpendPerPeriod,
      )}/${period} in punitive overage is avoidable by buying up the base ` +
      `allowance from ${formatQty(includedAllowance)} to ${formatQty(usage)} units.`;
    askCents = overageSpendPerPeriod;
  }

  if (savingPerPeriodCents <= 0) return [];

  const annualizedSavingsCents = annualizeCents(savingPerPeriodCents, period);
  const annualOverageSpend = annualizeCents(overageSpendPerPeriod, period);

  const unitLabel = unitWord(invoices) ?? "unit";

  const title = `${vendor.vendor.name}: ${formatQty(
    obs.overageUnits,
  )} ${unitLabel}/${period} over allowance billed at punitive overage`;

  const summary =
    `Plan includes ${formatQty(includedAllowance)} ${unitLabel}/${period}, but ` +
    `invoices bill ${formatQty(usage)} (${formatQty(obs.overageUnits)} over) at ` +
    `${formatUSDPrecise(obs.overageUnitPriceCents)}/${unitLabel} = ${formatUSD(
      overageSpendPerPeriod,
    )}/${period} (${formatUSD(annualOverageSpend)}/yr) in overage. ${buyUpNarrative} ` +
    `Annualized avoidable savings ${formatUSD(annualizedSavingsCents)}.`;

  const sourceDocContract = contract.sourceDoc;
  const overInvoice = invoices.find((inv) =>
    inv.lines.some((l) => l.lineType === "overage" && l.qty === obs.overageUnits),
  );
  const sourceDocInvoice = overInvoice?.sourceDoc ?? null;

  const evidence = [
    {
      label: "Included allowance (contract commitment)",
      value: `${formatQty(includedAllowance)} ${unitLabel} per ${period}`,
      sourceDoc: sourceDocContract,
    },
    {
      label: "Contract overage rate",
      value: `${formatUSDPrecise(obs.overageUnitPriceCents)} per ${unitLabel}`,
      sourceDoc: sourceDocContract,
    },
    {
      label: "Billed usage (invoice)",
      value: `${formatQty(usage)} ${unitLabel} (${formatQty(
        obs.overageUnits,
      )} over the ${formatQty(includedAllowance)} allowance)`,
      sourceDoc: sourceDocInvoice,
    },
    {
      label: "Overage charge per period",
      value: `${formatQty(obs.overageUnits)} x ${formatUSDPrecise(
        obs.overageUnitPriceCents,
      )} = ${formatUSD(overageSpendPerPeriod)} / ${period} (${formatUSD(
        annualOverageSpend,
      )} / yr)`,
      sourceDoc: sourceDocInvoice,
    },
  ];

  if (buyUp) {
    evidence.push({
      label: "Published buy-up tier",
      value: `Allowance up to ${formatQty(
        buyUp.buyUp.tierMax ?? usage,
      )} for a flat base of ${formatUSD(
        buyUp.buyUp.baseFeeCents,
      )} / ${period} (+${formatUSD(
        buyUp.buyUp.baseFeeCents - buyUp.base.baseFeeCents,
      )} over the base tier)`,
      sourceDoc: sourceDocContract,
    });
  }

  evidence.push({
    label: "Annualized avoidable savings",
    value: `${formatUSD(savingPerPeriodCents)} / ${period} x ${annualizeCents(
      1,
      period,
    )} = ${formatUSD(annualizedSavingsCents)} / yr`,
    sourceDoc: null,
  });

  const recommendedAsk = buyUp
    ? `Move to the higher-allowance tier (up to ${formatQty(
        buyUp.buyUp.tierMax ?? usage,
      )} ${unitLabel}) for +${formatUSD(
        buyUp.buyUp.baseFeeCents - buyUp.base.baseFeeCents,
      )}/${period}, eliminating the ${formatUSD(
        overageSpendPerPeriod,
      )}/${period} overage charge — a net ${formatUSD(
        annualizedSavingsCents,
      )}/yr reduction.`
    : `Buy up the base allowance from ${formatQty(includedAllowance)} to at least ` +
      `${formatQty(usage)} ${unitLabel}/${period}, eliminating the ${formatUSD(
        overageSpendPerPeriod,
      )}/${period} punitive overage — ${formatUSD(askCents)}/${period} ` +
      `(${formatUSD(annualizedSavingsCents)}/yr).`;

  const finding = makeFinding({
    ruleId: RULE_ID,
    ruleName: RULE_NAME,
    category: "tier_optimization",
    vendorId: vendor.vendor.id,
    vendorName: vendor.vendor.name,
    title,
    summary,
    savingsType: "avoidance",
    annualizedSavingsCents,
    confidence: 0.85,
    severity: annualizedSavingsCents >= 5_000_000 ? "high" : "medium",
    leverage:
      "Consistent allowance breach means a higher base allowance (cheaper per unit) " +
      "or a renegotiated overage rate beats paying punitive overage month after month.",
    evidence,
    recommendedAsk,
  });

  return [finding];
}

/** Infer a human unit word from the overage line's unit of measure. */
function unitWord(invoices: Invoice[]): string | null {
  for (const inv of invoices) {
    for (const line of inv.lines) {
      if (line.lineType === "overage" && line.uom) {
        return line.uom;
      }
    }
  }
  return null;
}

export default perVendorRule(
  RULE_ID,
  RULE_NAME,
  "tier_optimization",
  evaluate,
);

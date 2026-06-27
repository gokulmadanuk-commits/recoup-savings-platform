/**
 * R10 — Tier Downgrade / Right-Sizing (over-provisioned plan).
 *
 * Finds a buyer sitting on a premium plan tier (e.g. E5/Enterprise) whose users
 * touch ZERO of that tier's tier-exclusive features. Unlike R03 (idle seat), the
 * seat here is active — it is simply over-tiered. Safe to downgrade to the next
 * cheaper tier, realized as cost avoidance at renewal.
 *
 *   perSeatSaving = currentTierPrice - lowerTierPrice
 *   annualSaving  = perSeatSaving * downgradableSeats * billingPeriodsPerYear
 *
 * Inputs (all from the canonical model — never from the answer key):
 *   - contract.commitment.tier / tierPricePerSeatCents / contractedSeats
 *   - contract.featureCatalog: feature -> minTier (which tier first unlocks it)
 *   - usage records of kind "feature": per-feature adoption (used: true/false)
 *   - the lower tier's per-seat price, resolved from the contract rate card
 *     (a RateCardLine whose sku/description names the next-cheaper tier).
 *
 * The current seed corpus plants NO R10 vendor (EXPECTED has no R10 rows), so on
 * seedDataset() this rule must — and does — emit zero findings: every gate below
 * (feature catalog present, tier-exclusive features defined, feature telemetry
 * present, a resolvable cheaper tier price, positive saving) fails closed.
 */
import { perVendorRule, makeFinding, type RuleContext } from "./types";
import type { Finding, VendorRecord, RateCardLine } from "../types";
import { periodsPerYear, type BillingPeriod, formatUSDPrecise, formatQty } from "../money";

/** A plan tier with a known per-seat price, ordered cheapest -> most expensive. */
interface TierPrice {
  tier: string;
  perSeatCents: number;
}

/**
 * Resolve the per-seat price of every plan tier we can price, by reading the
 * contract rate card for lines whose sku/description names a tier appearing in
 * the feature catalog. The current tier's price is taken from the commitment.
 */
function resolveTierPrices(
  rateCard: RateCardLine[],
  tierNames: string[],
  currentTier: string,
  currentPerSeatCents: number,
): Map<string, number> {
  const prices = new Map<string, number>();
  prices.set(currentTier, currentPerSeatCents);

  for (const tier of tierNames) {
    if (prices.has(tier)) continue;
    const needle = tier.toLowerCase();
    const line = rateCard.find((r) => {
      const hay = `${r.sku} ${r.description}`.toLowerCase();
      return hay.includes(needle);
    });
    if (line) prices.set(tier, line.unitPriceCents);
  }
  return prices;
}

/**
 * Order the tiers cheapest -> most expensive. Prefer ordering by known per-seat
 * price; fall back to first-appearance order in the feature catalog (which lists
 * features roughly by ascending unlock tier).
 */
function orderTiers(catalogOrder: string[], prices: Map<string, number>): TierPrice[] {
  const priced = catalogOrder
    .filter((t) => prices.has(t))
    .map((t) => ({ tier: t, perSeatCents: prices.get(t)! }));
  return priced.sort((a, b) => a.perSeatCents - b.perSeatCents);
}

function findingsFor(vendor: VendorRecord, _ctx: RuleContext): Finding[] {
  const contract = vendor.contract;
  if (!contract) return [];

  const commitment = contract.commitment;
  const catalog = contract.featureCatalog ?? [];
  // Need a current tier, its per-seat price, a seat count, and a feature catalog.
  if (!commitment) return [];
  const currentTier = commitment.tier;
  const currentPerSeat = commitment.tierPricePerSeatCents;
  const seats = commitment.contractedSeats;
  if (!currentTier || currentPerSeat == null || seats == null || seats <= 0) return [];
  if (catalog.length === 0) return [];

  // Features that ONLY exist at the current tier (tier-exclusive at this level).
  const tierExclusiveFeatures = catalog
    .filter((c) => c.minTier === currentTier)
    .map((c) => c.feature);
  if (tierExclusiveFeatures.length === 0) return [];

  // Per-feature usage telemetry for this vendor.
  const featureUsage = vendor.usage.filter((u) => u.kind === "feature");
  if (featureUsage.length === 0) return [];

  // Was ANY tier-exclusive (premium) feature actually used?
  const exclusiveSet = new Set(tierExclusiveFeatures);
  const usedExclusive = featureUsage.filter((u) => {
    const name = u.feature ?? u.identifier;
    return name != null && exclusiveSet.has(name) && u.used === true;
  });
  // Premium features are in use -> the tier is justified, not a downgrade candidate.
  if (usedExclusive.length > 0) return [];

  // Build a price-ordered tier ladder and find the next-cheaper priceable tier.
  const catalogOrder: string[] = [];
  for (const c of catalog) {
    if (!catalogOrder.includes(c.minTier)) catalogOrder.push(c.minTier);
  }
  if (!catalogOrder.includes(currentTier)) catalogOrder.push(currentTier);

  const prices = resolveTierPrices(contract.rateCard, catalogOrder, currentTier, currentPerSeat);
  const ladder = orderTiers(catalogOrder, prices);
  const idx = ladder.findIndex((t) => t.tier === currentTier);
  if (idx <= 0) return []; // no cheaper priceable tier below the current one

  const lowerTier = ladder[idx - 1];
  const perSeatSaving = currentPerSeat - lowerTier.perSeatCents;
  if (perSeatSaving <= 0) return [];

  const period = (commitment.measurementPeriod ?? "monthly") as BillingPeriod;
  const annualSaving = perSeatSaving * seats * periodsPerYear(period);
  if (annualSaving <= 0) return [];

  const featureList = tierExclusiveFeatures.join(", ");

  return [
    makeFinding({
      ruleId: "R10",
      ruleName: "Tier Downgrade / Right-Sizing",
      category: "tier_optimization",
      vendorId: vendor.vendor.id,
      vendorName: vendor.vendor.name,
      title: `Over-provisioned on ${currentTier}: downgrade to ${lowerTier.tier}`,
      summary:
        `All ${formatQty(seats)} seats are licensed on the ${currentTier} tier ` +
        `(${formatUSDPrecise(currentPerSeat)}/seat), but usage telemetry shows ZERO ` +
        `adoption of the ${currentTier}-exclusive features (${featureList}). ` +
        `Downgrading to ${lowerTier.tier} (${formatUSDPrecise(lowerTier.perSeatCents)}/seat) ` +
        `saves ${formatUSDPrecise(perSeatSaving)}/seat with no loss of used capability.`,
      savingsType: "avoidance",
      annualizedSavingsCents: annualSaving,
      atRiskCents: 0,
      confidence: 0.82,
      severity: "high",
      leverage:
        `"You sold us ${currentTier}; nobody uses the ${currentTier}-only features — ` +
        `we are moving to ${lowerTier.tier} at renewal unless you match the ` +
        `${lowerTier.tier}-equivalent price." Pair with R01 timing and R03 seat data ` +
        `for a combined right-sizing package.`,
      evidence: [
        {
          label: "Current tier (contract)",
          value:
            `${currentTier} @ ${formatUSDPrecise(currentPerSeat)}/seat x ` +
            `${formatQty(seats)} seats, billed ${period}`,
          sourceDoc: contract.sourceDoc,
        },
        {
          label: `${currentTier}-exclusive features (feature catalog)`,
          value: featureList,
          sourceDoc: contract.sourceDoc,
        },
        {
          label: "Premium-feature adoption (usage telemetry)",
          value:
            `0 of ${tierExclusiveFeatures.length} ${currentTier}-exclusive features used ` +
            `across ${featureUsage.length} tracked feature records`,
          sourceDoc: "usage_export",
        },
        {
          label: `Next-cheaper tier (${lowerTier.tier})`,
          value: `${formatUSDPrecise(lowerTier.perSeatCents)}/seat`,
          sourceDoc: contract.sourceDoc,
        },
        {
          label: "Annualized saving",
          value:
            `${formatUSDPrecise(perSeatSaving)}/seat x ${formatQty(seats)} seats x ` +
            `${periodsPerYear(period)} periods = ${formatUSDPrecise(annualSaving)}`,
          sourceDoc: null,
        },
      ],
      recommendedAsk:
        `Downgrade all ${formatQty(seats)} seats from ${currentTier} to ${lowerTier.tier} ` +
        `at renewal, reducing the per-seat rate from ${formatUSDPrecise(currentPerSeat)} to ` +
        `${formatUSDPrecise(lowerTier.perSeatCents)} — an annual reduction of ` +
        `${formatUSDPrecise(annualSaving)}.`,
      deadlineDate: contract.endDate ?? null,
    }),
  ];
}

const rule = perVendorRule(
  "R10",
  "Tier Downgrade / Right-Sizing",
  "tier_optimization",
  findingsFor,
);

export default rule;

/**
 * Ranking + portfolio rollups for the revenue engine — mirror of ../../rules/rank.
 * The ranking key is `totalRecoverableCents` (arrears + forward uplift).
 */
import { daysBetween } from "../../dates";
import type { ISODate } from "../../dates";
import { projectEscalator } from "../escalator";
import type {
  RevenueFinding,
  RevenueFindingCategoryT,
  RevenueCategorySummary,
  CustomerSummary,
  CustomerRecord,
  RevenueDataset,
  PriceIncrease,
} from "../types";

export const REV_CATEGORY_LABELS: Record<RevenueFindingCategoryT, string> = {
  escalator_missed: "Escalator not applied",
  price_step_missed: "Price step missed",
  expired_discount: "Expired discount",
  tier_breach: "Tier under-billed",
  unbilled_usage: "Unbilled usage",
  min_commit_shortfall: "Minimum shortfall",
  missing_surcharge: "Missing surcharge",
  unbilled_services: "Unbilled services",
  renewal_repricing: "Renewal mispriced",
  late_interest: "Late-payment interest",
  rebate_over_credit: "Over-credited",
  other: "Other",
};

/** Sort: total recoverable desc, then arrears-dominant first, then confidence desc. */
export function rankRevenueFindings(findings: RevenueFinding[]): RevenueFinding[] {
  return [...findings].sort((a, b) => {
    if (b.totalRecoverableCents !== a.totalRecoverableCents)
      return b.totalRecoverableCents - a.totalRecoverableCents;
    if (a.recoveryType !== b.recoveryType)
      return a.recoveryType === "arrears" ? -1 : 1;
    return b.confidence - a.confidence;
  });
}

/** Annual revenue under management for a customer: contract value, else billings. */
export function customerContractRevenueCents(record: CustomerRecord): number {
  if (record.contract) return record.contract.currentAnnualValueCents;
  return record.billings.reduce((a, b) => a + b.totalCents, 0);
}

export function summarizeRevenueCategories(
  findings: RevenueFinding[],
): RevenueCategorySummary[] {
  const map = new Map<RevenueFindingCategoryT, RevenueCategorySummary>();
  for (const f of findings) {
    const cur =
      map.get(f.category) ??
      {
        category: f.category,
        label: REV_CATEGORY_LABELS[f.category],
        count: 0,
        recoverableCents: 0,
        arrearsCents: 0,
        upliftCents: 0,
      };
    cur.count += 1;
    cur.recoverableCents += f.totalRecoverableCents;
    cur.arrearsCents += f.arrearsToDateCents;
    cur.upliftCents += f.annualizedUpliftCents;
    map.set(f.category, cur);
  }
  return [...map.values()].sort((a, b) => b.recoverableCents - a.recoverableCents);
}

export function summarizeCustomers(
  dataset: RevenueDataset,
  findings: RevenueFinding[],
): CustomerSummary[] {
  const byCustomer = new Map<string, RevenueFinding[]>();
  for (const f of findings) {
    if (!byCustomer.has(f.customerId)) byCustomer.set(f.customerId, []);
    byCustomer.get(f.customerId)!.push(f);
  }
  return dataset.customers
    .map((record): CustomerSummary => {
      const fs = byCustomer.get(record.customer.id) ?? [];
      const openARCents = record.arAging.reduce((a, r) => a + r.balanceCents, 0);
      return {
        id: record.customer.id,
        name: record.customer.name,
        segment: record.customer.segment,
        annualRevenueCents: customerContractRevenueCents(record),
        recoverableCents: fs.reduce((a, f) => a + f.totalRecoverableCents, 0),
        arrearsCents: fs.reduce((a, f) => a + f.arrearsToDateCents, 0),
        upliftCents: fs.reduce((a, f) => a + f.annualizedUpliftCents, 0),
        findingCount: fs.length,
        openARCents,
      };
    })
    .sort((a, b) => b.recoverableCents - a.recoverableCents);
}

/**
 * Upcoming corrective price actions (powers the uplift calendar): the next
 * escalator anniversary, any scheduled price step, and intro-discount expiries —
 * each with the current vs. correct price and the days until it bites.
 */
export function summarizePriceIncreases(
  dataset: RevenueDataset,
  analysisDate: ISODate,
): PriceIncrease[] {
  const out: PriceIncrease[] = [];
  const thisYear = Number(analysisDate.slice(0, 4));

  for (const { customer, contract } of dataset.customers) {
    if (!contract) continue;
    const base = {
      customerId: customer.id,
      customerName: customer.name,
      segment: customer.segment,
    };

    // Escalator: next anniversary's correct annual value vs. the current value.
    if (contract.escalator && contract.escalator.type !== "none") {
      const month = contract.escalator.anniversaryMonth ?? 1;
      const baseYear =
        contract.escalator.baseIndexYear ??
        Number(contract.effectiveDate.slice(0, 4));
      const nextYear =
        Number(analysisDate.slice(5, 7)) <= month ? thisYear : thisYear + 1;
      const proj = projectEscalator({
        basePriceCents: contract.currentAnnualValueCents,
        baseYear,
        throughYear: nextYear,
        escalator: contract.escalator,
      });
      const effectiveDate = `${nextYear}-${String(month).padStart(2, "0")}-01`;
      if (proj.currentPriceCents > contract.currentAnnualValueCents) {
        out.push({
          ...base,
          mechanism: "escalator",
          effectiveDate,
          currentPriceCents: contract.currentAnnualValueCents,
          correctPriceCents: proj.currentPriceCents,
          upliftCents: proj.currentPriceCents - contract.currentAnnualValueCents,
          daysToEffective: daysBetween(analysisDate, effectiveDate),
          clause: "Price Adjustment (escalation)",
        });
      }
    }

    // Scheduled price steps.
    for (const step of contract.priceIncreaseSchedule) {
      out.push({
        ...base,
        mechanism: "step",
        effectiveDate: step.effectiveDate,
        currentPriceCents: 0,
        correctPriceCents: step.newUnitPriceCents,
        upliftCents: step.newUnitPriceCents,
        daysToEffective: daysBetween(analysisDate, step.effectiveDate),
        clause: step.note ?? "Scheduled price increase",
      });
    }

    // Intro-discount expiry → list price restored.
    if (contract.introDiscount) {
      out.push({
        ...base,
        mechanism: "discount_expiry",
        effectiveDate: contract.introDiscount.expiryDate,
        currentPriceCents: 0,
        correctPriceCents: 0,
        upliftCents: 0,
        daysToEffective: daysBetween(
          analysisDate,
          contract.introDiscount.expiryDate,
        ),
        clause: `Introductory discount (${Math.round(contract.introDiscount.pct * 100)}%) expiry`,
      });
    }
  }

  return out.sort((a, b) => a.daysToEffective - b.daysToEffective);
}

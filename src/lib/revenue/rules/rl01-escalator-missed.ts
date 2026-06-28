/**
 * RL01 — Escalator never / under-applied.
 *
 * The contract entitles the seller to index the annual fee (CPI / RPI / fixed) at
 * each anniversary, but billing stayed flat. We project the correct price path
 * from the base year to now and reconcile against what was billed: arrears = Σ of
 * completed-year shortfalls, uplift = the current-year forward gap. Relationship
 * risk grades how much is *claimable* (the longer the silent under-billing, the
 * more it drops from a retroactive claim toward a forward-only correction).
 *
 * Guard against false positives: only fires when billing is demonstrably flat
 * (or below the correct escalated rate) — a contract whose billings already track
 * the escalated price yields nothing.
 */
import { perCustomerRule, makeRevenueFinding } from "./types";
import type { RevenueRule } from "./types";
import { reconcileCatchUp } from "../escalator";
import { auditWindowAxis, waiverEstoppelAxis } from "./risk";
import { formatUSD } from "../../money";
import { monthsBetween } from "../../dates";
import type { CustomerContract, BillingDoc } from "../types";

const ID = "RL01";
const NAME = "Escalator not applied";

/** Trailing annual recurring revenue actually billed (flat when never escalated). */
function annualRecurringBilledCents(billings: BillingDoc[]): number | null {
  if (billings.length === 0) return null;
  const recent = [...billings]
    .sort((a, b) => a.invoiceDate.localeCompare(b.invoiceDate))
    .slice(-12);
  const monthly = recent.map((b) =>
    b.lines
      .filter((l) => l.lineType === "recurring")
      .reduce((a, l) => a + l.lineTotalCents, 0),
  );
  const withRecurring = monthly.filter((m) => m > 0);
  if (withRecurring.length === 0) return null;
  const avg = withRecurring.reduce((a, m) => a + m, 0) / withRecurring.length;
  return Math.round(avg * 12);
}

function nextAnniversary(contract: CustomerContract, analysisDate: string): string {
  const month = contract.escalator?.anniversaryMonth ?? 1;
  const year = Number(analysisDate.slice(0, 4));
  const thisYears = `${year}-${String(month).padStart(2, "0")}-01`;
  return thisYears > analysisDate
    ? thisYears
    : `${year + 1}-${String(month).padStart(2, "0")}-01`;
}

export const rl01: RevenueRule = perCustomerRule(
  ID,
  NAME,
  "escalator_missed",
  (record, ctx) => {
    const contract = record.contract;
    if (!contract || !contract.escalator || contract.escalator.type === "none")
      return [];

    const currentYear = Number(ctx.analysisDate.slice(0, 4));
    const baseYear =
      contract.escalator.baseIndexYear ??
      Number(contract.effectiveDate.slice(0, 4));
    if (baseYear >= currentYear) return [];

    const basePriceCents = contract.currentAnnualValueCents;
    const catchUp = reconcileCatchUp(
      {
        basePriceCents,
        baseYear,
        throughYear: currentYear,
        escalator: contract.escalator,
      },
      {},
      currentYear,
    );
    const correctCurrentCents = catchUp.projection.currentPriceCents;

    // Guard: billing must be flat / below the correct escalated rate.
    const billedAnnual = annualRecurringBilledCents(record.billings);
    const tol = Math.round(correctCurrentCents * ctx.config.rateTolerancePct);
    if (billedAnnual !== null && billedAnnual >= correctCurrentCents - tol)
      return [];

    const arrears = catchUp.arrearsCents;
    const uplift = catchUp.upliftCents;
    if (arrears + uplift < 100_00) return []; // immaterial (< $100)

    const monthsElapsed = monthsBetween(contract.effectiveDate, ctx.analysisDate);
    const annual = contract.currentAnnualValueCents;
    const relationship = annual >= 100_000_00 ? 0.4 : annual >= 500_000_00 ? 0.55 : 0.7;

    const idx =
      contract.escalator.type === "rpi" || contract.escalator.type === "rpi_plus"
        ? ctx.rpi
        : ctx.cpi;

    return [
      makeRevenueFinding({
        ruleId: ID,
        ruleName: NAME,
        category: "escalator_missed",
        customerId: record.customer.id,
        customerName: record.customer.name,
        title: `${contract.escalator.type.toUpperCase().replace("_", "+")} escalator never applied — billed flat since ${baseYear}`,
        summary: `The agreement indexes the annual fee at each anniversary, but it has been billed flat at ${formatUSD(basePriceCents)} since ${baseYear}. The correct current run-rate is ${formatUSD(correctCurrentCents)} — ${catchUp.perYear.length} anniversaries of uplift were never billed.`,
        arrearsToDateCents: arrears,
        annualizedUpliftCents: uplift,
        confidence: 0.9,
        severity: arrears + uplift >= 250_000_00 ? "high" : "medium",
        leverage: `The Price Adjustment clause entitles ${ctx.dataset.seller} to index the fee to ${idx.series}; the rate has not moved since ${baseYear}, so the entitlement is unambiguous. Audit rights cover the last ${contract.auditWindowMonths} months.`,
        evidence: [
          { label: "Base annual value", value: formatUSD(basePriceCents), sourceDoc: contract.sourceDoc },
          { label: "Correct current value", value: formatUSD(correctCurrentCents), sourceDoc: null },
          { label: "Currently billed", value: formatUSD(billedAnnual ?? basePriceCents), sourceDoc: record.billings[0]?.sourceDoc ?? null },
          { label: "Anniversaries missed", value: String(catchUp.perYear.length), sourceDoc: null },
          { label: "Index", value: idx.series, sourceDoc: null },
        ],
        recommendedAsk: `Reprice forward to ${formatUSD(correctCurrentCents)}/yr (+${formatUSD(uplift)}) and recover the in-window arrears (${formatUSD(arrears)} total to date; audit right covers the last ${contract.auditWindowMonths} months).`,
        clauseCited: "Price Adjustment (escalation)",
        deadlineDate: nextAnniversary(contract, ctx.analysisDate),
        risk: {
          entitlement: 0.9,
          auditWindow: auditWindowAxis(monthsElapsed, contract.auditWindowMonths),
          waiverEstoppel: waiverEstoppelAxis(monthsElapsed),
          relationship,
        },
      }),
    ];
  },
);

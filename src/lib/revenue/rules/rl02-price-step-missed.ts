/**
 * RL02 — Scheduled price step never triggered.
 *
 * The contract's priceIncreaseSchedule carries an explicit, dated list-price step
 * (e.g. the monthly recurring service fee rises on 2025-10-01), but billing on and
 * after that date still bills the OLD price. We take each step whose effectiveDate
 * has already passed, find the recurring billings dated on/after it that are priced
 * below the stepped rate, and reconcile:
 *   arrears = Σ (steppedPrice − billedPrice) over the under-billed months to date
 *   uplift  = (steppedPrice − billedPrice) annualised (×12) — the forward run-rate gap
 *
 * A discrete, recently-effective, contractually-fixed step → grade A (clean
 * retroactive claim): unambiguous entitlement, fully in-window, no waiver risk.
 *
 * Guard against false positives: only fires when billings on/after the step are
 * actually priced below the stepped rate. A contract already billing at (or above)
 * the new price yields nothing.
 */
import { perCustomerRule, makeRevenueFinding } from "./types";
import type { RevenueRule } from "./types";
import { formatUSD, formatUSDPrecise } from "../../money";
import type { BillingDoc, PriceStep } from "../types";

const ID = "RL02";
const NAME = "Price step never triggered";

/** Effective recurring unit price billed on a doc (Σ recurring line totals / Σ qty). */
function recurringUnitPriceCents(doc: BillingDoc, sku: string | null): number | null {
  const lines = doc.lines.filter(
    (l) => l.lineType === "recurring" && (sku === null || l.sku === sku),
  );
  if (lines.length === 0) return null;
  const totalCents = lines.reduce((a, l) => a + l.lineTotalCents, 0);
  const totalQty = lines.reduce((a, l) => a + l.qty, 0);
  if (totalQty <= 0) return null;
  return Math.round(totalCents / totalQty);
}

export const rl02: RevenueRule = perCustomerRule(
  ID,
  NAME,
  "price_step_missed",
  (record, ctx) => {
    const contract = record.contract;
    if (!contract || contract.priceIncreaseSchedule.length === 0) return [];

    // Consider only steps whose effective date has already arrived.
    const dueSteps = contract.priceIncreaseSchedule.filter(
      (s) => s.effectiveDate <= ctx.analysisDate,
    );
    if (dueSteps.length === 0) return [];

    // Use the most recent due step (the price that *should* be billing now).
    const step: PriceStep = [...dueSteps].sort((a, b) =>
      a.effectiveDate.localeCompare(b.effectiveDate),
    )[dueSteps.length - 1];

    const stepped = step.newUnitPriceCents;

    // Recurring billings dated on/after the step, priced below the stepped rate.
    const underBilled = record.billings
      .filter((b) => b.invoiceDate >= step.effectiveDate)
      .map((b) => ({ doc: b, unit: recurringUnitPriceCents(b, step.sku) }))
      .filter(
        (x): x is { doc: BillingDoc; unit: number } =>
          x.unit !== null && x.unit < stepped,
      );

    // Guard: nothing on/after the step is under-priced → billing already correct.
    if (underBilled.length === 0) return [];

    // Arrears = Σ per-month shortfalls actually billed below the stepped price.
    const arrears = underBilled.reduce(
      (a, x) => a + (stepped - x.unit),
      0,
    );

    // Uplift = the current (latest) monthly gap, annualised forward.
    const latest = [...underBilled].sort((a, b) =>
      a.doc.invoiceDate.localeCompare(b.doc.invoiceDate),
    )[underBilled.length - 1];
    const currentGap = stepped - latest.unit;
    const uplift = currentGap * 12;

    if (arrears + uplift < 100_00) return []; // immaterial (< $100)

    const billedNow = latest.unit;
    const months = underBilled.length;

    return [
      makeRevenueFinding({
        ruleId: ID,
        ruleName: NAME,
        category: "price_step_missed",
        customerId: record.customer.id,
        customerName: record.customer.name,
        title: `Scheduled price step (${step.effectiveDate}) never applied — still billing ${formatUSD(billedNow)}/mo`,
        summary: `The pricing schedule raised the monthly recurring fee to ${formatUSD(stepped)} effective ${step.effectiveDate}, but the last ${months} billings still charge ${formatUSD(billedNow)}/mo — a ${formatUSD(currentGap)}/mo shortfall. Correct the rate forward and back-bill the in-window arrears.`,
        arrearsToDateCents: arrears,
        annualizedUpliftCents: uplift,
        confidence: 0.95,
        severity: arrears + uplift >= 250_000_00 ? "high" : "medium",
        leverage: `The Scheduled Price Increase clause fixes a dated, agreed step to ${formatUSDPrecise(stepped)}/mo effective ${step.effectiveDate}; the entitlement is explicit and every under-billed month sits inside the ${contract.auditWindowMonths}-month audit window.`,
        evidence: [
          { label: "Stepped price (per month)", value: formatUSD(stepped), sourceDoc: contract.sourceDoc },
          { label: "Currently billed (per month)", value: formatUSD(billedNow), sourceDoc: latest.doc.sourceDoc },
          { label: "Monthly shortfall", value: formatUSD(currentGap), sourceDoc: null },
          { label: "Step effective date", value: step.effectiveDate, sourceDoc: contract.sourceDoc },
          { label: "Under-billed months", value: String(months), sourceDoc: null },
        ],
        recommendedAsk: `Reprice forward to ${formatUSD(stepped)}/mo (+${formatUSD(uplift)}/yr) and recover the ${formatUSD(arrears)} of arrears billed below the stepped rate since ${step.effectiveDate}.`,
        clauseCited: step.note ?? "Scheduled Price Increase",
        deadlineDate: step.effectiveDate,
        risk: {
          entitlement: 0.9,
          auditWindow: 1.0,
          waiverEstoppel: 0.9,
          relationship: 0.7,
        },
      }),
    ];
  },
);

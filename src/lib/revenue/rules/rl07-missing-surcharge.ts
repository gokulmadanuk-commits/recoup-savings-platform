/**
 * RL07 — Contractual surcharge (fuel / fx / index pass-through) never billed.
 *
 * The contract entitles the seller to a percentage surcharge on the base
 * recurring fee (e.g. a fuel surcharge indexed to EIA on-highway diesel), but no
 * surcharge-type line ever appears on the billings. We sum the contractually
 * due surcharge over every billed month that carried a base recurring charge:
 *   arrears = Σ (ratePct × that month's recurring base)   [recovery]
 *   uplift  = (current monthly surcharge) × 12            [forward avoidance]
 *
 * This is an explicit, unambiguous pass-through, so the entitlement is airtight
 * and — billed flat for only the recent window — waiver/estoppel risk is low:
 * relationship risk grades A (back-bill the in-window arrears + correct forward).
 *
 * Guard against false positives: fires ONLY when the contract carries a
 * percentage surcharge AND not a single billing line is a surcharge line. If any
 * surcharge line is present (the seller already bills it), returns [].
 */
import { perCustomerRule, makeRevenueFinding } from "./types";
import type { RevenueRule } from "./types";
import { auditWindowAxis, waiverEstoppelAxis } from "./risk";
import { formatUSD, formatPct } from "../../money";
import { monthsBetween } from "../../dates";
import type { BillingDoc, SurchargeTerm } from "../types";

const ID = "RL07";
const NAME = "Contractual surcharge never billed";

/** Recurring base billed in one document (the surcharge applies to this). */
function recurringBaseCents(doc: BillingDoc): number {
  return doc.lines
    .filter((l) => l.lineType === "recurring")
    .reduce((a, l) => a + l.lineTotalCents, 0);
}

export const rl07: RevenueRule = perCustomerRule(
  ID,
  NAME,
  "missing_surcharge",
  (record, ctx) => {
    const contract = record.contract;
    if (!contract) return [];

    // The entitled percentage surcharge (fuel / fx / index pass-through).
    const surcharge: SurchargeTerm | undefined = contract.surcharges.find(
      (s) => s.ratePct != null && s.ratePct > 0,
    );
    if (!surcharge || surcharge.ratePct == null) return [];

    const billings = record.billings;
    if (billings.length === 0) return [];

    // Guard: if ANY surcharge line already appears, the seller bills it → no leak.
    const alreadyBilled = billings.some((b) =>
      b.lines.some((l) => l.lineType === "surcharge"),
    );
    if (alreadyBilled) return [];

    // Arrears = Σ over billed months of (ratePct × that month's recurring base).
    let arrears = 0;
    let lastMonthBase = 0;
    for (const b of [...billings].sort((a, c) =>
      a.invoiceDate.localeCompare(c.invoiceDate),
    )) {
      const base = recurringBaseCents(b);
      if (base <= 0) continue; // a month with no base carries no surcharge
      arrears += Math.round(base * surcharge.ratePct);
      lastMonthBase = base; // most recent month with a base → current run-rate
    }
    if (lastMonthBase <= 0) return []; // nothing to surcharge against

    // Forward uplift = current monthly surcharge annualised.
    const monthlySurcharge = Math.round(lastMonthBase * surcharge.ratePct);
    const uplift = monthlySurcharge * 12;
    if (arrears + uplift < 100_00) return []; // immaterial (< $100)

    const monthsElapsed = monthsBetween(contract.effectiveDate, ctx.analysisDate);
    const annual = contract.currentAnnualValueCents;
    const relationship = annual >= 1_000_000_00 ? 0.4 : annual >= 250_000_00 ? 0.5 : 0.6;

    return [
      makeRevenueFinding({
        ruleId: ID,
        ruleName: NAME,
        category: "missing_surcharge",
        customerId: record.customer.id,
        customerName: record.customer.name,
        title: `${surcharge.label} (${formatPct(surcharge.ratePct)}) never billed`,
        summary: `The agreement entitles ${ctx.dataset.seller} to a ${formatPct(surcharge.ratePct)} ${surcharge.kind} surcharge (${surcharge.basis}) on the base recurring fee, but no surcharge line appears on any billing. At the current base run-rate that is ${formatUSD(monthlySurcharge)}/mo — ${formatUSD(arrears)} unbilled to date and ${formatUSD(uplift)}/yr going forward.`,
        arrearsToDateCents: arrears,
        annualizedUpliftCents: uplift,
        confidence: 0.95,
        severity: arrears + uplift >= 100_000_00 ? "high" : "medium",
        leverage: `The ${surcharge.label} clause is an explicit pass-through (${surcharge.basis}); the surcharge is a fixed ${formatPct(surcharge.ratePct)} of the base fee, so the entitlement is mechanical and unambiguous. Audit rights cover the last ${contract.auditWindowMonths} months.`,
        evidence: [
          { label: "Surcharge basis", value: surcharge.basis, sourceDoc: contract.sourceDoc },
          { label: "Surcharge rate", value: formatPct(surcharge.ratePct), sourceDoc: contract.sourceDoc },
          { label: "Current monthly base", value: formatUSD(lastMonthBase), sourceDoc: record.billings.at(-1)?.sourceDoc ?? null },
          { label: "Monthly surcharge due", value: formatUSD(monthlySurcharge), sourceDoc: null },
          { label: "Surcharge lines billed", value: "0", sourceDoc: record.billings[0]?.sourceDoc ?? null },
        ],
        recommendedAsk: `Add the ${surcharge.label} line (${formatPct(surcharge.ratePct)} of base = ${formatUSD(monthlySurcharge)}/mo) to billing going forward (+${formatUSD(uplift)}/yr) and back-bill the in-window arrears (${formatUSD(arrears)} to date; audit right covers the last ${contract.auditWindowMonths} months).`,
        clauseCited: `${surcharge.label} (pass-through)`,
        deadlineDate: null,
        risk: {
          entitlement: 0.95,
          auditWindow: auditWindowAxis(monthsElapsed, contract.auditWindowMonths),
          waiverEstoppel: 0.9,
          relationship,
        },
      }),
    ];
  },
);

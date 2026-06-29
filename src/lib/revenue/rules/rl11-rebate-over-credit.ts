/**
 * RL11 — Credits / rebates issued in excess of the contracted rate.
 *
 * The contract grants a VALID (non-expired) volume rebate/discount at a fixed
 * percentage of gross. Billing, however, applies discount/credit lines totalling
 * MORE than that contracted percentage — the customer was over-credited. For each
 * billed month we compare the credit actually given against the allowed credit
 * (introDiscount.pct × gross recurring) and bank the positive difference: arrears
 * = Σ of the in-window monthly excess, uplift = the latest month's excess
 * annualised (the forward run-rate leak if billing continues unchanged).
 *
 * Distinct from RL03 (expired_discount): here the discount is STILL VALID, not
 * expired — the entitlement exists, it is just OVER-APPLIED beyond the agreed pct.
 *
 * Guard against false positives: fires ONLY when the total credit given in a month
 * exceeds the contracted percentage of that month's gross. A contract whose
 * credits sit at or below the allowed percentage yields nothing.
 */
import { perCustomerRule, makeRevenueFinding } from "./types";
import type { RevenueRule } from "./types";
import { auditWindowAxis, waiverEstoppelAxis } from "./risk";
import { formatUSD, formatPct } from "../../money";
import { monthsBetween } from "../../dates";
import type { BillingDoc } from "../types";

const ID = "RL11";
const NAME = "Credits issued in excess of contracted rate";

/** Gross recurring (the discount base) for one billing document. */
function grossRecurringCents(doc: BillingDoc): number {
  return doc.lines
    .filter((l) => l.lineType === "recurring")
    .reduce((a, l) => a + l.lineTotalCents, 0);
}

/** Total credit/discount applied in one billing document (a positive magnitude). */
function creditGivenCents(doc: BillingDoc): number {
  const signed = doc.lines
    .filter((l) => l.lineType === "discount" || l.lineType === "credit")
    .reduce((a, l) => a + l.lineTotalCents, 0);
  return Math.abs(signed);
}

export const rl11: RevenueRule = perCustomerRule(
  ID,
  NAME,
  "rebate_over_credit",
  (record, ctx) => {
    const contract = record.contract;
    if (!contract || !contract.introDiscount) return [];

    const discount = contract.introDiscount;
    // Must be a VALID (non-expired) rebate — that is what distinguishes this from
    // RL03. An expired discount is RL03's domain, not ours.
    if (discount.expiryDate < ctx.analysisDate) return [];
    if (discount.pct <= 0) return [];

    const billings = [...record.billings].sort((a, b) =>
      a.invoiceDate.localeCompare(b.invoiceDate),
    );
    if (billings.length === 0) return [];

    // Per-month excess credit = actual credit − allowed (pct × gross), clamped ≥ 0.
    let arrears = 0;
    let lastMonthlyExcess = 0;
    let monthsOver = 0;
    let totalGross = 0;
    let totalCredit = 0;
    for (const doc of billings) {
      const gross = grossRecurringCents(doc);
      if (gross <= 0) continue;
      const allowed = Math.round(gross * discount.pct);
      const given = creditGivenCents(doc);
      const excess = given - allowed;
      totalGross += gross;
      totalCredit += given;
      if (excess > 0) {
        arrears += excess;
        lastMonthlyExcess = excess;
        monthsOver += 1;
      }
    }

    // Guard: credits are within (or below) the allowed percentage everywhere.
    if (arrears <= 0 || monthsOver === 0) return [];

    // Forward run-rate leak: the most recent month's excess, annualised.
    const uplift = lastMonthlyExcess * 12;
    if (arrears + uplift < 100_00) return []; // immaterial (< $100)

    const allowedPct = discount.pct;
    const actualPct = totalGross > 0 ? totalCredit / totalGross : 0;
    const excessPctPts = actualPct - allowedPct;

    // A recent, discrete over-crediting issue (the billed months) → low waiver and
    // largely in-window, so this grades cleanly toward a retroactive claim.
    const monthsElapsed = monthsBetween(contract.effectiveDate, ctx.analysisDate);
    const annual = contract.currentAnnualValueCents;
    const relationship = annual >= 100_000_00 ? 0.5 : annual >= 50_000_00 ? 0.6 : 0.7;

    return [
      makeRevenueFinding({
        ruleId: ID,
        ruleName: NAME,
        category: "rebate_over_credit",
        customerId: record.customer.id,
        customerName: record.customer.name,
        title: `Rebate over-applied — ${formatPct(actualPct)} credited vs ${formatPct(allowedPct)} contracted`,
        summary: `The agreement grants a valid ${formatPct(allowedPct)} volume rebate (effective through ${discount.expiryDate}), but billing applied credits averaging ${formatPct(actualPct)} of gross — over-crediting by ${formatPct(excessPctPts)} across ${monthsOver} month(s). Excess credit given to date is ${formatUSD(arrears)}; left uncorrected the forward leak is ${formatUSD(uplift)}/yr.`,
        arrearsToDateCents: arrears,
        annualizedUpliftCents: uplift,
        confidence: 0.95,
        severity: arrears + uplift >= 250_000_00 ? "high" : "medium",
        leverage: `The Volume Rebate clause fixes the discount at ${formatPct(allowedPct)} of gross; credits beyond that are unsupported and recoverable. The rebate is still in force (expires ${discount.expiryDate}), so this is an over-application — not a lapsed-discount dispute. Audit rights cover the last ${contract.auditWindowMonths} months.`,
        evidence: [
          { label: "Contracted rebate", value: formatPct(allowedPct), sourceDoc: contract.sourceDoc },
          { label: "Actual credit rate", value: formatPct(actualPct), sourceDoc: record.billings[0]?.sourceDoc ?? null },
          { label: "Over-credit (pct pts)", value: formatPct(excessPctPts), sourceDoc: null },
          { label: "Excess credit to date", value: formatUSD(arrears), sourceDoc: null },
          { label: "Months over-credited", value: String(monthsOver), sourceDoc: null },
        ],
        recommendedAsk: `Correct the rebate line to the contracted ${formatPct(allowedPct)} (stops the ${formatUSD(uplift)}/yr forward leak) and recover the ${formatUSD(arrears)} over-credited to date under the audit/true-up clause.`,
        clauseCited: "Volume Rebate / Discount",
        deadlineDate: discount.expiryDate,
        risk: {
          entitlement: 0.9,
          auditWindow: auditWindowAxis(monthsOver, contract.auditWindowMonths),
          waiverEstoppel: waiverEstoppelAxis(monthsOver),
          relationship,
        },
      }),
    ];
  },
);

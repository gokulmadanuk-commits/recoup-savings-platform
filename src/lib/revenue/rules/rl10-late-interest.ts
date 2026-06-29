/**
 * RL10 — Contractual late-payment interest never charged.
 *
 * The agreement entitles the seller to charge a monthly finance charge on
 * past-due balances (e.g. 1.5%/mo), but no interest line has ever been billed.
 * We walk the AR ledger and, for every balance past due beyond the grace period
 * (ageDays > 30), accrue interest = balance × monthlyRate × floor(monthsOverdue)
 * and sum it. This is a one-time recovery: arrears = total accrued interest,
 * uplift = 0, recoveryType "arrears".
 *
 * Guard against false positives: only fires when the contract actually carries a
 * positive late-payment interest rate AND at least one AR row is overdue past the
 * grace period. A current (non-overdue) balance contributes nothing, and a
 * customer with no overdue AR — or no interest clause — yields no finding.
 */
import { perCustomerRule, makeRevenueFinding } from "./types";
import type { RevenueRule } from "./types";
import { auditWindowAxis, waiverEstoppelAxis } from "./risk";
import { formatUSD, formatPct } from "../../money";
import type { ARAgingRecord } from "../types";

const ID = "RL10";
const NAME = "Late-payment interest not charged";

/** Days of grace before a past-due balance starts accruing finance charges. */
const GRACE_DAYS = 30;

interface Accrual {
  row: ARAgingRecord;
  monthsOverdue: number;
  interestCents: number;
}

/** Accrue contractual interest on one AR row; 0 if within the grace period. */
function accrueRow(row: ARAgingRecord, monthlyRate: number): Accrual {
  if (row.ageDays <= GRACE_DAYS) {
    return { row, monthsOverdue: 0, interestCents: 0 };
  }
  // Whole months overdue (simple interest, no compounding).
  const monthsOverdue = Math.floor(row.ageDays / 30);
  const interestCents = Math.round(
    row.balanceCents * monthlyRate * monthsOverdue,
  );
  return { row, monthsOverdue, interestCents };
}

export const rl10: RevenueRule = perCustomerRule(
  ID,
  NAME,
  "late_interest",
  (record, ctx) => {
    const contract = record.contract;
    if (!contract) return [];

    const monthlyRate = contract.latePaymentInterestPct;
    // Guard: no interest clause (null) or a zero/negative rate → nothing to claim.
    if (monthlyRate === null || monthlyRate <= 0) return [];

    // Guard: no AR at all → nothing to accrue.
    if (record.arAging.length === 0) return [];

    const accruals = record.arAging.map((r) => accrueRow(r, monthlyRate));
    const overdue = accruals.filter((a) => a.interestCents > 0);

    // Guard: every balance is within grace (current) → no leakage.
    if (overdue.length === 0) return [];

    const arrears = overdue.reduce((a, x) => a + x.interestCents, 0);
    if (arrears < 100_00) return []; // immaterial (< $100)

    const totalOverdueBalance = overdue.reduce(
      (a, x) => a + x.row.balanceCents,
      0,
    );
    const oldest = overdue.reduce(
      (a, x) => (x.row.ageDays > a.row.ageDays ? x : a),
      overdue[0],
    );

    // Recent/discrete AR issue: audit window fully covers it (≈1.0) and there is
    // no multi-year course of dealing, so waiver/estoppel risk is low (≈0.9).
    const monthsSinceOldest = oldest.row.ageDays / 30.44;

    return [
      makeRevenueFinding({
        ruleId: ID,
        ruleName: NAME,
        category: "late_interest",
        customerId: record.customer.id,
        customerName: record.customer.name,
        title: `Late-payment interest (${formatPct(monthlyRate)}/mo) never charged on ${overdue.length} past-due invoice${overdue.length > 1 ? "s" : ""}`,
        summary: `The agreement entitles ${ctx.dataset.seller} to a ${formatPct(monthlyRate)}/mo finance charge on balances past due, but no interest has been billed. ${formatUSD(totalOverdueBalance)} sits past due beyond the ${GRACE_DAYS}-day grace period; the accrued unbilled interest to date is ${formatUSD(arrears)}.`,
        arrearsToDateCents: arrears,
        annualizedUpliftCents: 0,
        confidence: 0.92,
        severity: arrears >= 100_000_00 ? "high" : "medium",
        leverage: `The Late Payment / finance-charge clause sets a ${formatPct(monthlyRate)}/mo rate on past-due balances; the entitlement is mechanical once an invoice ages past the grace period. The exposure is recent (oldest item ${oldest.row.ageDays} days past due), so it sits squarely inside the ${contract.auditWindowMonths}-month audit window.`,
        evidence: [
          { label: "Late-payment rate", value: `${formatPct(monthlyRate)}/mo`, sourceDoc: contract.sourceDoc },
          { label: "Past-due balance (post-grace)", value: formatUSD(totalOverdueBalance), sourceDoc: null },
          ...overdue.map((a) => ({
            label: `${a.row.invoiceNumber} — ${a.row.ageDays}d past due (${a.monthsOverdue} mo)`,
            value: `${formatUSD(a.row.balanceCents)} → ${formatUSD(a.interestCents)} interest`,
            sourceDoc: null,
          })),
          { label: "Total accrued interest", value: formatUSD(arrears), sourceDoc: null },
        ],
        recommendedAsk: `Issue a finance-charge invoice for ${formatUSD(arrears)} in accrued late-payment interest under the Late Payment clause (${formatPct(monthlyRate)}/mo on balances past the ${GRACE_DAYS}-day grace period).`,
        clauseCited: "Late Payment (finance charge)",
        deadlineDate: null,
        risk: {
          entitlement: 0.9,
          auditWindow: auditWindowAxis(monthsSinceOldest, contract.auditWindowMonths),
          waiverEstoppel: waiverEstoppelAxis(monthsSinceOldest),
          relationship: 0.6,
        },
      }),
    ];
  },
);

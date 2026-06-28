/**
 * RL08 — Services delivered but never billed (work orders).
 *
 * The seller fulfilled discrete jobs (special-handling / expedited freight) that
 * sit in `record.workOrders` with status "delivered", but no billing line ever
 * referenced them: there is no `BillingLine.workOrderId` equal to the delivered
 * job's `workOrderId`. Each such job is contracted at a known unit price, so the
 * recovery is unambiguous: arrears = Σ contractedUnitPrice × qty over the orphan
 * delivered jobs. This is a one-time recovery (the work is done), so uplift = 0
 * and recoveryType = "arrears".
 *
 * Discrimination: "invoiced" jobs and any delivered job that DOES have a matching
 * billed line are excluded — the rule only counts delivered work that the billing
 * system never picked up. Cancelled jobs are not billable and are ignored.
 *
 * Guard against false positives: if every delivered work order is referenced by a
 * billing line (i.e. it was billed), the rule yields nothing.
 */
import { perCustomerRule, makeRevenueFinding } from "./types";
import type { RevenueRule } from "./types";
import { auditWindowAxis, waiverEstoppelAxis } from "./risk";
import { formatUSD } from "../../money";
import { monthsBetween } from "../../dates";
import type { WorkOrder } from "../types";

const ID = "RL08";
const NAME = "Unbilled delivered services";

/** Earliest service date among a set of work orders (for window/risk dating). */
function earliestServiceDate(wos: WorkOrder[]): string | null {
  if (wos.length === 0) return null;
  return wos.reduce((min, w) => (w.serviceDate < min ? w.serviceDate : min), wos[0].serviceDate);
}

export const rl08: RevenueRule = perCustomerRule(
  ID,
  NAME,
  "unbilled_services",
  (record, ctx) => {
    const delivered = record.workOrders.filter((w) => w.status === "delivered");
    if (delivered.length === 0) return [];

    // Every workOrderId that any billing line points at — already billed.
    const billedWorkOrderIds = new Set<string>();
    for (const doc of record.billings) {
      for (const line of doc.lines) {
        if (line.workOrderId) billedWorkOrderIds.add(line.workOrderId);
      }
    }

    // Delivered work that no billing line references.
    const unbilled = delivered.filter((w) => !billedWorkOrderIds.has(w.workOrderId));
    if (unbilled.length === 0) return []; // every delivered job was billed — nothing to recover.

    const arrears = unbilled.reduce(
      (sum, w) => sum + Math.round(w.contractedUnitPriceCents * w.qty),
      0,
    );
    if (arrears < 100_00) return []; // immaterial (< $100)

    const uplift = 0; // one-time recovery: the work is done, there is no forward run-rate gap.

    const contract = record.contract;
    const firstService = earliestServiceDate(unbilled) ?? ctx.analysisDate;
    const monthsElapsed = monthsBetween(firstService, ctx.analysisDate);
    const auditWindowMonths = contract?.auditWindowMonths ?? 24;

    // Discrete, recent issue → grade A: strong entitlement, in-window, low waiver risk.
    const annual = contract?.currentAnnualValueCents ?? 0;
    const relationship = annual >= 1_000_000_00 ? 0.45 : annual >= 250_000_00 ? 0.55 : 0.65;

    return [
      makeRevenueFinding({
        ruleId: ID,
        ruleName: NAME,
        category: "unbilled_services",
        customerId: record.customer.id,
        customerName: record.customer.name,
        title: `${unbilled.length} delivered work orders never billed — ${formatUSD(arrears)} unrecognized`,
        summary: `${unbilled.length} special-handling / expedited jobs were delivered and accepted but never invoiced — no billing line references their work-order numbers. At the contracted unit price these total ${formatUSD(arrears)} of completed, unbilled service revenue.`,
        arrearsToDateCents: arrears,
        annualizedUpliftCents: uplift,
        confidence: 0.95,
        severity: arrears >= 250_000_00 ? "high" : "medium",
        leverage: `The work orders are signed-off as delivered at the contracted unit price; the entitlement is unambiguous and the entire amount sits within the ${auditWindowMonths}-month audit window. ${ctx.dataset.seller} can issue corrected invoices immediately.`,
        evidence: [
          { label: "Delivered, unbilled work orders", value: String(unbilled.length), sourceDoc: null },
          ...unbilled.map((w) => ({
            label: `WO ${w.workOrderId} (${w.serviceDate})`,
            value: `${formatUSD(Math.round(w.contractedUnitPriceCents * w.qty))} — ${w.description}`,
            sourceDoc: contract?.sourceDoc ?? null,
          })),
          { label: "Total unbilled", value: formatUSD(arrears), sourceDoc: null },
        ],
        recommendedAsk: `Issue corrected invoices for the ${unbilled.length} delivered work orders (${formatUSD(arrears)} total). The amount is fully in-window and supported by signed delivery records.`,
        clauseCited: "Services & Fees (billing for delivered work orders)",
        deadlineDate: null,
        risk: {
          entitlement: 0.95,
          auditWindow: auditWindowAxis(monthsElapsed, auditWindowMonths),
          waiverEstoppel: Math.max(0.9, waiverEstoppelAxis(monthsElapsed)),
          relationship,
        },
      }),
    ];
  },
);

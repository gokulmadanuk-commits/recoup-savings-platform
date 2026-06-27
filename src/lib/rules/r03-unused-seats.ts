/**
 * R03 — Unused Seats / Idle Licenses.
 *
 * Finds the gap between paid/contracted seats and seats with genuine recent
 * activity, using the per-user utilization export (the required third data
 * source). A seat counts as ACTIVE when its record is flagged `active` or its
 * last-active date falls within `CONFIG.inactiveDaysDefault` of the analysis
 * date; everything else (stale, inactive, never-used) is idle headcount the
 * buyer pays for but does not use.
 *
 *   idleSeats = paidSeats - activeSeats
 *   annualizedSavingsCents = idleSeats * pricePerSeat * 12   (avoidance @ renewal)
 *
 * Realizable in full at renewal when seats are reducible; this is the strongest
 * right-sizing lever a buyer has. Pair with R01 timing so the reclaim lands
 * before the notice deadline.
 */
import { perVendorRule, makeFinding, type Rule } from "./types";
import { addDays, daysBetween, type ISODate } from "../dates";
import { formatUSD, formatUSDPrecise, formatQty, formatPct } from "../money";
import type { Contract, InvoiceLine, UsageRecord } from "../types";

const RULE_ID = "R03";
const RULE_NAME = "Unused Seats / Idle Licenses";

/** A seat is active if explicitly flagged active, or last seen within the window. */
function isActiveSeat(
  rec: UsageRecord,
  analysisDate: ISODate,
  inactiveDays: number,
): boolean {
  if (rec.status === "active") return true;
  // never_used / decommissioned / returned are definitively not active.
  if (rec.status && rec.status !== "inactive") return false;
  if (!rec.lastActiveDate) return false;
  // "Within the window" = the gap from last activity to today is <= threshold.
  return daysBetween(rec.lastActiveDate, analysisDate) <= inactiveDays;
}

/** Notice deadline = end of term minus the notice window, when one applies. */
function renewalDeadline(contract: Contract): ISODate | null {
  if (!contract.autoRenew || !contract.noticeWindowDays) return null;
  return addDays(contract.endDate, -contract.noticeWindowDays);
}

const rule: Rule = perVendorRule(
  RULE_ID,
  RULE_NAME,
  "unused_seats",
  (vendor, ctx) => {
    const { contract } = vendor;
    if (!contract) return [];

    // Seat utilization export is the required third source — no data, no claim.
    const seatRecords = vendor.usage.filter((u) => u.kind === "seat");
    if (seatRecords.length === 0) return [];

    // paidSeats: contracted seats, reconciled up to the max invoiced seat qty.
    const seatLines: InvoiceLine[] = vendor.invoices.flatMap((inv) =>
      inv.lines.filter((l) => l.lineType === "seat"),
    );
    const maxInvoicedSeatQty = seatLines.reduce((m, l) => Math.max(m, l.qty), 0);
    const contractedSeats = contract.commitment?.contractedSeats ?? 0;
    const paidSeats = Math.max(contractedSeats, maxInvoicedSeatQty);
    if (paidSeats <= 0) return [];

    // pricePerSeat: contracted tier price, falling back to the invoiced unit price.
    const tierPrice = contract.commitment?.tierPricePerSeatCents ?? null;
    const invoicedSeatPrice = seatLines.length
      ? seatLines[seatLines.length - 1].unitPriceCents
      : null;
    const pricePerSeat = tierPrice ?? invoicedSeatPrice ?? 0;
    if (pricePerSeat <= 0) return [];

    const inactiveDays = ctx.config.inactiveDaysDefault;
    const activeSeats = seatRecords.filter((r) =>
      isActiveSeat(r, ctx.analysisDate, inactiveDays),
    ).length;

    const idleSeats = paidSeats - activeSeats;
    if (idleSeats <= 0) return [];

    // Breakdown of the idle population, for the evidence trail.
    const neverUsed = seatRecords.filter((r) => r.status === "never_used").length;
    const staleInactive = seatRecords.filter(
      (r) =>
        r.status !== "never_used" &&
        !isActiveSeat(r, ctx.analysisDate, inactiveDays),
    ).length;
    // Idle attributable to seats provisioned beyond the utilization roster.
    const unaccountedIdle = Math.max(0, paidSeats - seatRecords.length);

    const rawSavings = idleSeats * pricePerSeat * 12;
    // Sanity ceiling per the config benchmark (~$1,785/idle-seat/yr).
    const sanityCeiling = idleSeats * ctx.config.idleSeatAnnualSanityCents;
    const annualizedSavingsCents = Math.min(rawSavings, sanityCeiling);
    const capped = annualizedSavingsCents < rawSavings;

    const utilizationPct = activeSeats / paidSeats;
    const monthlyWaste = idleSeats * pricePerSeat;

    const breakdownParts: string[] = [];
    if (neverUsed) breakdownParts.push(`${formatQty(neverUsed)} never logged in`);
    if (staleInactive)
      breakdownParts.push(`${formatQty(staleInactive)} inactive >${inactiveDays}d`);
    if (unaccountedIdle)
      breakdownParts.push(`${formatQty(unaccountedIdle)} provisioned beyond roster`);
    const breakdown = breakdownParts.length ? ` (${breakdownParts.join(", ")})` : "";

    const evidence = [
      {
        label: "Contracted seats (commitment)",
        value: `${formatQty(paidSeats)} seats @ ${formatUSDPrecise(
          pricePerSeat,
        )}/seat/mo (tier ${contract.commitment?.tier ?? "—"})`,
        sourceDoc: contract.sourceDoc,
      },
      {
        label: "Active seats (utilization export)",
        value: `${formatQty(activeSeats)} of ${formatQty(
          paidSeats,
        )} seats active within ${inactiveDays} days of ${ctx.analysisDate} (${formatPct(
          utilizationPct,
        )} utilization)`,
        sourceDoc: "utilization-export",
      },
      {
        label: "Idle seats",
        value: `${formatQty(idleSeats)} idle = ${formatQty(
          paidSeats,
        )} paid − ${formatQty(activeSeats)} active${breakdown}`,
        sourceDoc: "utilization-export",
      },
      {
        label: "Annualized idle cost",
        value: `${formatQty(idleSeats)} × ${formatUSDPrecise(
          pricePerSeat,
        )} × 12 = ${formatUSD(rawSavings)}/yr (${formatUSD(monthlyWaste)}/mo)`,
        sourceDoc: contract.sourceDoc,
      },
    ];

    const recommendedAsk = `Reduce the seat count from ${formatQty(
      paidSeats,
    )} to ${formatQty(activeSeats)} active seats at renewal (drop ${formatQty(
      idleSeats,
    )} idle seats), holding the ${formatUSDPrecise(
      pricePerSeat,
    )}/seat/mo rate flat — an annual avoidance of ${formatUSD(
      annualizedSavingsCents,
    )}.`;

    // Confidence: hard utilization data is strong; avoidance band 0.75–0.9.
    const confidence = utilizationPct <= 0.7 ? 0.88 : 0.8;
    const severity =
      annualizedSavingsCents >= 2_500_000
        ? "high"
        : annualizedSavingsCents >= 500_000
          ? "medium"
          : "watch";

    return [
      makeFinding({
        ruleId: RULE_ID,
        ruleName: RULE_NAME,
        category: "unused_seats",
        vendorId: vendor.vendor.id,
        vendorName: vendor.vendor.name,
        title: `${formatQty(idleSeats)} idle seats of ${formatQty(
          paidSeats,
        )} paid (${formatPct(utilizationPct)} utilization)`,
        summary:
          `Utilization export shows only ${formatQty(activeSeats)} of ${formatQty(
            paidSeats,
          )} paid seats active within the ${inactiveDays}-day activity window — ${formatQty(
            idleSeats,
          )} seats are billed but idle. Reclaiming them at renewal avoids ${formatUSD(
            annualizedSavingsCents,
          )}/yr.` + (capped ? " (Capped to the per-seat sanity benchmark.)" : ""),
        savingsType: "avoidance",
        annualizedSavingsCents,
        atRiskCents: annualizedSavingsCents,
        confidence,
        severity,
        leverage:
          "Hard utilization data ('only N of M seats active') is the strongest right-sizing lever at renewal. Anchor on active seats, not provisioned. Offer to hold the per-seat rate flat plus a true-up clause to add seats later at the same price — it protects the vendor's unit economics and makes 'yes' easy. Pair with R01 timing so the ask lands before the notice deadline.",
        evidence,
        recommendedAsk,
        deadlineDate: renewalDeadline(contract),
      }),
    ];
  },
);

export default rule;

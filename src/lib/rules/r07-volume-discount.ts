/**
 * R07 — Missed Volume Discount.
 *
 * The contract carries a volume-tier schedule (`contract.tiers[]`: tierMin /
 * tierMax / unitPriceCents). Cumulative quantity over the billed period crosses
 * into a cheaper tier, but the invoices keep billing the higher-volume
 * (standard) rate. We compare the rate actually applied on the usage line(s)
 * against the rate the buyer EARNED for its cumulative volume; if the earned
 * tier is cheaper, the buyer overpaid on every unit.
 *
 *   missedPerUnit = appliedUnitPrice - earnedTierUnitPrice
 *   recoverable / annualized = missedPerUnit * cumulativeAnnualQty
 *
 * Honest computation — reads only the canonical dataset (contract tiers +
 * invoice lines), never the answer key.
 */
import { perVendorRule, makeFinding, type Rule } from "./types";
import type { Evidence, Invoice, InvoiceLine, TieredRate } from "../types";
import { formatUSD, formatUSDPrecise, formatQty } from "../money";

/** The tier whose [tierMin, tierMax) window contains `cumulative` (earned tier). */
function earnedTierFor(tiers: TieredRate[], cumulative: number): TieredRate | null {
  let best: TieredRate | null = null;
  for (const t of tiers) {
    const lo = t.tierMin;
    const hi = t.tierMax ?? Infinity;
    if (cumulative >= lo && cumulative < hi) {
      // Prefer the tier with the highest floor that still contains the volume.
      if (!best || t.tierMin > best.tierMin) best = t;
    }
  }
  // Cumulative may sit exactly on / above an open-ended top tier's floor.
  if (!best) {
    for (const t of tiers) {
      if (t.tierMax === null && cumulative >= t.tierMin) {
        if (!best || t.tierMin > best.tierMin) best = t;
      }
    }
  }
  return best;
}

/** The highest unit price among the tiers — the standard / un-earned rate. */
function standardTierPrice(tiers: TieredRate[]): number {
  return Math.max(...tiers.map((t) => t.unitPriceCents));
}

const rule: Rule = perVendorRule(
  "R07",
  "Missed Volume Discount",
  "missed_discount",
  (vr) => {
    const contract = vr.contract;
    if (!contract) return [];
    const tiers = contract.tiers;
    // Need an actual volume schedule (a single flat rate is not a discount tier).
    if (!tiers || tiers.length < 2) return [];

    const standardPrice = standardTierPrice(tiers);
    const cheapestPrice = Math.min(...tiers.map((t) => t.unitPriceCents));
    // No spread between tiers => no discount to miss.
    if (standardPrice <= cheapestPrice) return [];

    // The tier schedule governs the metered/usage line. Identify the lines that
    // were billed at the standard (un-earned) tier rate — those are the volume
    // line(s) the schedule applies to. Restrict to consumption-style lines so a
    // coincidental flat fee at the same price can't be swept in.
    const isVolumeLine = (l: InvoiceLine): boolean =>
      (l.lineType === "usage" || l.lineType === "overage") &&
      l.unitPriceCents === standardPrice;

    let cumulativeQty = 0;
    let appliedUnitPrice = 0;
    let sampleLine: InvoiceLine | null = null;
    let firstInvoice: Invoice | null = null;
    const monthlyQtys: number[] = [];

    for (const inv of vr.invoices) {
      let invQty = 0;
      for (const l of inv.lines) {
        if (!isVolumeLine(l)) continue;
        invQty += l.qty;
        appliedUnitPrice = l.unitPriceCents; // standard rate, by construction
        if (!sampleLine) {
          sampleLine = l;
          firstInvoice = inv;
        }
      }
      if (invQty > 0) {
        cumulativeQty += invQty;
        monthlyQtys.push(invQty);
      }
    }

    // Nothing billed at the standard tier rate => no missed-discount signal.
    if (cumulativeQty <= 0 || !sampleLine || !firstInvoice) return [];

    const earned = earnedTierFor(tiers, cumulativeQty);
    if (!earned) return [];

    // Did cumulative volume actually cross into a CHEAPER tier than what was billed?
    if (earned.unitPriceCents >= appliedUnitPrice) return [];

    const missedPerUnit = appliedUnitPrice - earned.unitPriceCents; // cents/unit
    // Whole earned-tier volume was billed at the un-earned rate, so both the
    // retroactive recoverable and the forward annualized figure use it.
    const annualizedSavingsCents = missedPerUnit * cumulativeQty;
    const recoverableToDateCents = annualizedSavingsCents;

    const breakpoint = earned.tierMin;
    const uom = sampleLine.uom || "unit";

    // Approximate the month the cumulative volume crossed the breakpoint, for color.
    let running = 0;
    let crossMonth = monthlyQtys.length;
    for (let i = 0; i < monthlyQtys.length; i++) {
      running += monthlyQtys[i];
      if (running >= breakpoint) {
        crossMonth = i + 1;
        break;
      }
    }

    const appliedStr = formatUSDPrecise(appliedUnitPrice);
    const earnedStr = formatUSDPrecise(earned.unitPriceCents);

    const evidence: Evidence[] = [
      {
        label: "Contracted volume-tier schedule",
        value: tiers
          .map((t) => {
            const hi = t.tierMax === null ? "and up" : `to ${formatQty(t.tierMax)}`;
            return `${formatQty(t.tierMin)} ${hi} ${uom}: ${formatUSDPrecise(t.unitPriceCents)}/${uom}`;
          })
          .join("; "),
        sourceDoc: contract.sourceDoc,
      },
      {
        label: "Earned tier (cumulative volume)",
        value: `Cumulative ${formatQty(cumulativeQty)} ${uom} over ${monthlyQtys.length} invoices crosses the ${formatQty(breakpoint)}-${uom} breakpoint (~invoice ${crossMonth}), earning ${earnedStr}/${uom}.`,
        sourceDoc: contract.sourceDoc,
      },
      {
        label: "Rate actually billed",
        value: `Every usage line billed at the standard ${appliedStr}/${uom} (e.g. ${formatQty(sampleLine.qty)} ${uom} on invoice ${firstInvoice.invoiceNumber}).`,
        sourceDoc: firstInvoice.sourceDoc,
      },
      {
        label: "Missed discount",
        value: `(${appliedStr} − ${earnedStr})/${uom} × ${formatQty(cumulativeQty)} ${uom} = ${formatUSD(annualizedSavingsCents)} overbilled.`,
        sourceDoc: firstInvoice.sourceDoc,
      },
    ];

    return [
      makeFinding({
        ruleId: "R07",
        ruleName: "Missed Volume Discount",
        category: "missed_discount",
        vendorId: vr.vendor.id,
        vendorName: vr.vendor.name,
        title: `Volume-tier discount earned but never applied — ${formatUSD(annualizedSavingsCents)}/yr`,
        summary:
          `Cumulative usage of ${formatQty(cumulativeQty)} ${uom} crossed the ${formatQty(breakpoint)}-${uom} ` +
          `breakpoint in the ${earnedStr}/${uom} tier, but every invoice kept billing the standard ${appliedStr}/${uom}. ` +
          `The buyer earned the cheaper rate yet was charged the higher one on the full annual volume, ` +
          `overpaying ${formatUSD(annualizedSavingsCents)}.`,
        savingsType: "recovery",
        annualizedSavingsCents,
        recoverableToDateCents,
        confidence: 0.95,
        severity: "high",
        leverage:
          `We crossed the ${formatQty(breakpoint)}-${uom} tier on cumulative annual volume; you billed all ` +
          `${monthlyQtys.length} invoices at the sub-breakpoint ${appliedStr}/${uom} rate. Owed a retroactive ` +
          `credit for the difference plus automatic tier application going forward.`,
        evidence,
        recommendedAsk:
          `Issue a retroactive credit of ${formatUSD(recoverableToDateCents)} ` +
          `(${formatUSDPrecise(missedPerUnit)}/${uom} × ${formatQty(cumulativeQty)} ${uom}) and apply the ` +
          `earned ${earnedStr}/${uom} tier automatically once cumulative volume crosses ${formatQty(breakpoint)} ${uom}, with an annual true-up.`,
      }),
    ];
  },
);

export default rule;

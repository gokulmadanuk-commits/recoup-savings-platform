/**
 * R02 — Invoice Rate Mismatch (overcharge vs contracted rate).
 *
 * For each invoice line we resolve the governing rate-card line (exact SKU,
 * else date-aware fuzzy description match) and flag any line billed above the
 * contracted unit price beyond tolerance. tolerance = max(rateToleranceMinCents,
 * round(contractRate * rateTolerancePct)). recoverableToDate sums the overcharge
 * across every matching historical line; annualizedSavings projects the most
 * recent period's per-period overcharge forward over a full year.
 *
 * Two guards keep this rule in its lane and out of the neighbours':
 *  - ASSET-BILLED LINES (assetId set) are per-asset metered/MRC charges where
 *    the rate-card "unit price" is only a reference base, not the contracted
 *    price for every site/circuit (those belong to R11). We skip them.
 *  - A genuine rate mismatch is STATIC: the same SKU is billed at the same wrong
 *    price in EVERY period it appears. A unit price that is at-contract early and
 *    rises mid-history is a year-over-year escalation (R04), not a rate-master
 *    overcharge — we require the SKU to be over-rate in every period it is billed.
 *
 * Documented, repeated overcharges on the same SKU are near-incontestable, so
 * this is a high-confidence recovery: demand a credit/refund for the back period
 * plus a forward correction.
 */
import type { Finding } from "../types";
import { perVendorRule, makeFinding } from "./types";
import { matchRateCardLine } from "./util";
import { formatUSDPrecise, formatUSD } from "../money";

const RULE_ID = "R02";
const RULE_NAME = "Invoice Rate Mismatch";

interface SkuAccumulator {
  sku: string | null;
  description: string;
  uom: string;
  contractRateCents: number;
  invoicedUnitPriceCents: number;
  /** Per-period quantity from the most recent overcharged invoice. */
  latestQty: number;
  /** Per-period overcharge from the most recent overcharged invoice. */
  latestPeriodOverchargeCents: number;
  /** Sum of overcharge across every matching historical line. */
  recoverableCents: number;
  /** Periods in which this SKU was billed above the contracted rate. */
  overchargedPeriods: number;
  /** Periods in which this SKU appeared at all (over- or at-rate). */
  totalPeriods: number;
  /** Set if any contributing line carried an asset id (per-asset billing). */
  assetBilled: boolean;
  matchConfidence: number;
  sampleSourceDoc: string;
  latestInvoiceNumber: string;
}

export default perVendorRule(
  RULE_ID,
  RULE_NAME,
  "rate_mismatch",
  (vendor): Finding[] => {
    const contract = vendor.contract;
    if (!contract || contract.rateCard.length === 0) return [];
    if (vendor.invoices.length === 0) return [];

    // Aggregate per resolved rate-card SKU/description.
    const bySku = new Map<string, SkuAccumulator>();

    // Process invoices oldest -> newest so "latest" wins for the annualized figure.
    const invoices = [...vendor.invoices].sort((a, b) =>
      a.invoiceDate < b.invoiceDate ? -1 : a.invoiceDate > b.invoiceDate ? 1 : 0,
    );

    for (const inv of invoices) {
      for (const line of inv.lines) {
        // Only price-bearing lines; credits/tax can't be "overcharged" here.
        if (line.lineType === "tax" || line.lineType === "credit") continue;

        const match = matchRateCardLine(contract.rateCard, line, {
          date: inv.invoiceDate,
        });
        const rate = match.rate;
        if (!rate) continue;

        const contractRate = rate.unitPriceCents;
        const tolerance = Math.max(
          1, // CONFIG.rateToleranceMinCents
          Math.round(contractRate * 0.005), // CONFIG.rateTolerancePct
        );
        const unitDelta = line.unitPriceCents - contractRate;
        const overcharged = unitDelta > tolerance;
        const periodOvercharge = overcharged ? unitDelta * line.qty : 0;

        const key = rate.sku || rate.description;
        let acc = bySku.get(key);
        if (!acc) {
          acc = {
            sku: rate.sku || null,
            description: rate.description,
            uom: rate.uom,
            contractRateCents: contractRate,
            invoicedUnitPriceCents: line.unitPriceCents,
            latestQty: line.qty,
            latestPeriodOverchargeCents: 0,
            recoverableCents: 0,
            overchargedPeriods: 0,
            totalPeriods: 0,
            assetBilled: false,
            matchConfidence: match.confidence,
            sampleSourceDoc: inv.sourceDoc,
            latestInvoiceNumber: inv.invoiceNumber,
          };
          bySku.set(key, acc);
        }
        acc.totalPeriods += 1;
        if (line.assetId) acc.assetBilled = true;
        if (overcharged) {
          acc.overchargedPeriods += 1;
          acc.recoverableCents += periodOvercharge;
          // Newest overcharged invoice wins for the per-period annualization basis.
          acc.latestQty = line.qty;
          acc.latestPeriodOverchargeCents = periodOvercharge;
          acc.invoicedUnitPriceCents = line.unitPriceCents;
          acc.sampleSourceDoc = inv.sourceDoc;
          acc.latestInvoiceNumber = inv.invoiceNumber;
          acc.matchConfidence = Math.min(acc.matchConfidence, match.confidence);
        }
      }
    }

    const overcharges = [...bySku.values()].filter(
      (o) =>
        o.overchargedPeriods > 0 &&
        // Guard 1: per-asset metered/MRC lines are R11 territory, not a unit-rate mismatch.
        !o.assetBilled &&
        // Guard 2: a static rate-master overcharge is over-rate in EVERY period it appears;
        // a mid-history step-up is a year-over-year escalation (R04), not a rate mismatch.
        o.overchargedPeriods === o.totalPeriods,
    );
    if (overcharges.length === 0) return [];

    // One finding per vendor aggregating its overcharged SKU(s).
    const recoverableToDateCents = overcharges.reduce(
      (a, o) => a + o.recoverableCents,
      0,
    );
    // Annualize the latest per-period overcharge for each SKU (monthly * 12).
    const annualizedSavingsCents = overcharges.reduce(
      (a, o) => a + o.latestPeriodOverchargeCents * 12,
      0,
    );

    const minConfidence = Math.min(...overcharges.map((o) => o.matchConfidence));
    // Documented, repeated overcharges are near-incontestable.
    const confidence = Math.min(0.97, 0.9 + (minConfidence >= 1 ? 0.05 : 0));

    const skuLabels = overcharges
      .map((o) => o.sku || o.description)
      .join(", ");

    const evidence = [
      {
        label: "Contract rate card",
        value: `Source: ${contract.sourceDoc}`,
        sourceDoc: contract.sourceDoc,
      },
      ...overcharges.flatMap((o) => {
        const skuTag = o.sku ? `${o.sku} — ` : "";
        return [
          {
            label: `Contracted rate (${o.sku || o.description})`,
            value: `${skuTag}${o.description}: ${formatUSDPrecise(o.contractRateCents)} per ${o.uom}`,
            sourceDoc: contract.sourceDoc,
          },
          {
            label: `Invoiced rate (${o.sku || o.description})`,
            value: `Billed ${formatUSDPrecise(o.invoicedUnitPriceCents)} per ${o.uom} (overcharge ${formatUSDPrecise(o.invoicedUnitPriceCents - o.contractRateCents)}/${o.uom}) on ${o.latestQty} ${o.uom} across ${o.overchargedPeriods} invoice${o.overchargedPeriods === 1 ? "" : "s"}`,
            sourceDoc: o.sampleSourceDoc,
          },
          {
            label: `Overcharge to date (${o.sku || o.description})`,
            value: `${formatUSD(o.recoverableCents)} over ${o.overchargedPeriods} period${o.overchargedPeriods === 1 ? "" : "s"} (latest invoice ${o.latestInvoiceNumber})`,
            sourceDoc: o.sampleSourceDoc,
          },
        ];
      }),
    ];

    const askParts = overcharges.map(
      (o) =>
        `re-rate ${o.sku || o.description} to the contracted ${formatUSDPrecise(o.contractRateCents)}/${o.uom}`,
    );
    const recommendedAsk = `Issue a credit memo of ${formatUSD(recoverableToDateCents)} for the back-billed overcharge and ${askParts.join("; ")} going forward.`;

    const finding = makeFinding({
      ruleId: RULE_ID,
      ruleName: RULE_NAME,
      category: "rate_mismatch",
      vendorId: vendor.vendor.id,
      vendorName: vendor.vendor.name,
      title: `Invoice rate mismatch — billed above contracted rate on ${skuLabels}`,
      summary: `${vendor.vendor.name} billed above the contracted rate-card price on ${overcharges.length} SKU${overcharges.length === 1 ? "" : "s"} (${skuLabels}). Documented overcharge of ${formatUSD(recoverableToDateCents)} to date; ${formatUSD(annualizedSavingsCents)}/yr forward at the current run-rate.`,
      savingsType: "recovery",
      annualizedSavingsCents,
      recoverableToDateCents,
      confidence,
      severity: "high",
      leverage:
        "Documented, repeated overcharges on the same SKU are near-incontestable. Demand a credit memo / cash refund for the back period (not just a forward fix) and an audit-rights clause going forward.",
      evidence,
      recommendedAsk,
    });

    return [finding];
  },
);

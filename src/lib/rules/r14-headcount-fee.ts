/**
 * R14 — Headcount-Based Fee Overbilling (PEPM / per-unit / %-of-base).
 *
 * Per-vendor rule with two variants:
 *
 *  (a) PEPM / per-unit count mismatch — when the contract sets a per-employee-
 *      per-month rate (`contract.pepmRateCents`), the invoice bills that rate on
 *      a billed headcount (the fee line's qty), but the authoritative HRIS roster
 *      (a `headcount` usage export) reports a lower count for the period.
 *        overcharge/mo = (billedCount - rosterCount) * pepmRate
 *
 *  (b) Percentage-of-base rate mismatch — when the contract sets a management fee
 *      as a percentage of a defined spend base (`contract.feePctOfBase`), the
 *      invoice computes the fee at a higher implied percentage of that base.
 *        overcharge/mo = billedFee - round(base * contractedPct)
 *
 * Either way the overcharge is documented arithmetic (recovery): we recover the
 * cash already overpaid and annualize the go-forward correction.
 */
import { perVendorRule, makeFinding } from "./types";
import {
  formatUSD,
  formatUSDPrecise,
  formatQty,
  formatPct,
} from "../money";
import type { Evidence, Invoice, VendorRecord } from "../types";

const RULE_ID = "R14";
const RULE_NAME = "Headcount-Based Fee Overbilling";

/** The fee line on an invoice (the line that carries the PEPM / management fee). */
function feeLine(inv: Invoice) {
  return inv.lines.find((l) => l.lineType === "fee") ?? null;
}

/* ------------------------------------------------------------------ */
/* Variant (a): PEPM / per-unit count mismatch                         */
/* ------------------------------------------------------------------ */

function pepmFinding(v: VendorRecord) {
  const contract = v.contract;
  if (!contract || contract.pepmRateCents == null) return [];
  const pepmRate = contract.pepmRateCents;

  // Authoritative roster counts keyed by period (HRIS headcount export).
  const roster = new Map<string, number>();
  for (const u of v.usage) {
    if (u.kind === "headcount" && u.count != null && u.period) {
      roster.set(u.period, u.count);
    }
  }
  if (roster.size === 0) return [];

  // A representative (most common) roster count, for the headline narrative.
  const rosterCounts = [...roster.values()];
  const authoritativeCount = rosterCounts
    .slice()
    .sort(
      (a, b) =>
        rosterCounts.filter((c) => c === b).length -
        rosterCounts.filter((c) => c === a).length,
    )[0];

  let recoverableToDateCents = 0;
  let billedCountSample = 0;
  let rosterCountSample = authoritativeCount;
  let overchargedMonths = 0;
  let monthlyOvercharge = 0;

  for (const inv of v.invoices) {
    const fl = feeLine(inv);
    if (!fl) continue;
    const billedCount = fl.qty;
    const period = inv.billingPeriodStart
      ? inv.billingPeriodStart.slice(0, 7)
      : null;
    const rosterCount =
      (period && roster.has(period) ? roster.get(period)! : undefined) ??
      authoritativeCount;
    const delta = billedCount - rosterCount;
    if (delta <= 0) continue;

    const monthOver = delta * pepmRate;
    recoverableToDateCents += monthOver;
    overchargedMonths += 1;
    billedCountSample = billedCount;
    rosterCountSample = rosterCount;
    monthlyOvercharge = monthOver;
  }

  if (overchargedMonths === 0) return [];

  const annualizedSavingsCents = monthlyOvercharge * 12;
  const overBilled = billedCountSample - rosterCountSample;

  const evidence: Evidence[] = [
    {
      label: "Contract fee basis (PEPM)",
      value: `${formatUSDPrecise(pepmRate)} per employee per month`,
      sourceDoc: contract.sourceDoc,
    },
    {
      label: "Invoiced billable headcount",
      value: `${formatQty(billedCountSample)} employees billed at ${formatUSDPrecise(
        pepmRate,
      )} PEPM`,
      sourceDoc: v.invoices[0]?.sourceDoc ?? contract.sourceDoc,
    },
    {
      label: "Authoritative HRIS roster",
      value: `${formatQty(rosterCountSample)} employees on the headcount export`,
      sourceDoc: null,
    },
    {
      label: "Over-billed headcount",
      value: `${formatQty(overBilled)} phantom employees x ${formatUSDPrecise(
        pepmRate,
      )} = ${formatUSDPrecise(monthlyOvercharge)}/mo`,
      sourceDoc: null,
    },
    {
      label: "Annualized overcharge",
      value: `${formatUSDPrecise(monthlyOvercharge)}/mo x 12 = ${formatUSD(
        annualizedSavingsCents,
      )}`,
      sourceDoc: null,
    },
    {
      label: "Recoverable to date",
      value: `${formatUSD(recoverableToDateCents)} across ${overchargedMonths} billed month(s)`,
      sourceDoc: null,
    },
  ];

  return [
    makeFinding({
      ruleId: RULE_ID,
      ruleName: RULE_NAME,
      category: "overbilling",
      vendorId: v.vendor.id,
      vendorName: v.vendor.name,
      title: `PEPM fee billed on ${formatQty(
        billedCountSample,
      )} employees vs ${formatQty(rosterCountSample)} on the HRIS roster`,
      summary: `${v.vendor.name} bills the ${formatUSDPrecise(
        pepmRate,
      )} per-employee-per-month fee on ${formatQty(
        billedCountSample,
      )} employees, but the authoritative HRIS roster shows only ${formatQty(
        rosterCountSample,
      )} for the same periods — ${formatQty(
        overBilled,
      )} phantom employees. That is an overcharge of ${formatUSDPrecise(
        monthlyOvercharge,
      )}/month (${formatUSD(
        annualizedSavingsCents,
      )}/yr), recoverable as a credit with a go-forward roster reconciliation.`,
      savingsType: "recovery",
      annualizedSavingsCents,
      recoverableToDateCents,
      confidence: 0.95,
      severity: "high",
      leverage:
        "'You billed PEPM on the higher headcount; our HRIS shows fewer employees.' Arithmetic-clean credit plus a monthly roster-reconciliation cadence so the count is trued up going forward.",
      evidence,
      recommendedAsk: `Issue a credit of ${formatUSD(
        recoverableToDateCents,
      )} for PEPM billed on ${formatQty(
        overBilled,
      )} phantom employees, correct billing to the ${formatQty(
        rosterCountSample,
      )}-employee HRIS roster going forward, and adopt a monthly roster reconciliation.`,
    }),
  ];
}

/* ------------------------------------------------------------------ */
/* Variant (b): percentage-of-base rate mismatch                       */
/* ------------------------------------------------------------------ */

function pctOfBaseFinding(v: VendorRecord) {
  const contract = v.contract;
  if (!contract || contract.feePctOfBase == null) return [];
  const contractedPct = contract.feePctOfBase;

  let recoverableToDateCents = 0;
  let overchargedMonths = 0;
  let monthlyOvercharge = 0;
  let baseSample = 0;
  let billedFeeSample = 0;
  let contractedFeeSample = 0;

  for (const inv of v.invoices) {
    const fl = feeLine(inv);
    if (!fl) continue;
    // The spend base is the non-fee, non-tax line on the invoice (the pass-through base).
    const baseLine = inv.lines.find(
      (l) => l.lineType !== "fee" && l.lineType !== "tax" && l.lineType !== "credit",
    );
    if (!baseLine) continue;
    const base = baseLine.lineTotalCents;
    const billedFee = fl.lineTotalCents;
    const contractedFee = Math.round(base * contractedPct);
    const delta = billedFee - contractedFee;
    if (delta <= 0) continue;

    recoverableToDateCents += delta;
    overchargedMonths += 1;
    monthlyOvercharge = delta;
    baseSample = base;
    billedFeeSample = billedFee;
    contractedFeeSample = contractedFee;
  }

  if (overchargedMonths === 0) return [];

  const annualizedSavingsCents = monthlyOvercharge * 12;
  const billedPct = baseSample > 0 ? billedFeeSample / baseSample : 0;

  const evidence: Evidence[] = [
    {
      label: "Contract fee basis (% of base)",
      value: `${formatPct(contractedPct)} of the spend base`,
      sourceDoc: contract.sourceDoc,
    },
    {
      label: "Spend base (per month)",
      value: `${formatUSD(baseSample)} pass-through base`,
      sourceDoc: v.invoices[0]?.sourceDoc ?? contract.sourceDoc,
    },
    {
      label: "Invoiced management fee",
      value: `${formatUSDPrecise(
        billedFeeSample,
      )} = ${formatPct(billedPct)} of the ${formatUSD(baseSample)} base`,
      sourceDoc: v.invoices[0]?.sourceDoc ?? contract.sourceDoc,
    },
    {
      label: "Contracted management fee",
      value: `${formatPct(contractedPct)} x ${formatUSD(
        baseSample,
      )} = ${formatUSDPrecise(contractedFeeSample)}`,
      sourceDoc: contract.sourceDoc,
    },
    {
      label: "Monthly overcharge",
      value: `${formatUSDPrecise(billedFeeSample)} - ${formatUSDPrecise(
        contractedFeeSample,
      )} = ${formatUSDPrecise(monthlyOvercharge)}/mo`,
      sourceDoc: null,
    },
    {
      label: "Annualized overcharge",
      value: `${formatUSDPrecise(monthlyOvercharge)}/mo x 12 = ${formatUSD(
        annualizedSavingsCents,
      )}`,
      sourceDoc: null,
    },
    {
      label: "Recoverable to date",
      value: `${formatUSD(recoverableToDateCents)} across ${overchargedMonths} billed month(s)`,
      sourceDoc: null,
    },
  ];

  return [
    makeFinding({
      ruleId: RULE_ID,
      ruleName: RULE_NAME,
      category: "overbilling",
      vendorId: v.vendor.id,
      vendorName: v.vendor.name,
      title: `Management fee billed at ${formatPct(
        billedPct,
      )} vs contracted ${formatPct(contractedPct)} of the spend base`,
      summary: `${v.vendor.name} computes its management fee at ${formatPct(
        billedPct,
      )} of the ${formatUSD(
        baseSample,
      )}/mo spend base, but the contract sets it at ${formatPct(
        contractedPct,
      )}. The ${formatPct(
        billedPct - contractedPct,
      )} gap is an overcharge of ${formatUSDPrecise(
        monthlyOvercharge,
      )}/month (${formatUSD(
        annualizedSavingsCents,
      )}/yr), recoverable as a credit with a go-forward rate correction.`,
      savingsType: "recovery",
      annualizedSavingsCents,
      recoverableToDateCents,
      confidence: 0.96,
      severity: "high",
      leverage:
        "'You computed the management fee at the higher percentage against a lower contracted percentage of ad spend.' Arithmetic-clean credit plus a go-forward correction to the contracted rate.",
      evidence,
      recommendedAsk: `Issue a credit of ${formatUSD(
        recoverableToDateCents,
      )} for the management fee overcharged above the contracted ${formatPct(
        contractedPct,
      )}, and re-rate all future invoices to ${formatPct(
        contractedPct,
      )} of the spend base.`,
    }),
  ];
}

export default perVendorRule(
  RULE_ID,
  RULE_NAME,
  "overbilling",
  (v) => [...pepmFinding(v), ...pctOfBaseFinding(v)],
);

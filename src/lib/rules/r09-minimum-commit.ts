/**
 * R09 — Minimum Commitment Shortfall (take-or-pay).
 *
 * A committed annual minimum (spend) the buyer pays for but does not consume.
 * We compare the contractual floor (`commitment.minCommitSpendCents`) against
 * actual consumption (the sum of the year's invoice totals). When consumption
 * falls below the floor the shortfall is wasted take-or-pay: in-term the floor
 * is owed, so the realizable saving is RIGHT-SIZING the next-term commitment to
 * projected consumption plus a buffer, tied to the renewal/notice window.
 *
 * Formula (per docs/DETECTION-RULES.md and CONFIG):
 *   minCommit          = commitment.minCommitSpendCents
 *   actualConsumption  = sum of invoice totals over the measured year
 *   shortfall          = max(0, minCommit - actualConsumption)
 *   utilization        = actualConsumption / minCommit
 *   rightSized         = round(actualConsumption * (1 + rightSizeBufferPct))
 *   annualizedSavings  = minCommit - rightSized   (avoidance)
 *
 * Fires when there is a positive shortfall and utilization is below the hard
 * flag threshold (CONFIG.minCommitUtilizationFlag).
 */
import { perVendorRule, makeFinding, type RuleContext } from "./types";
import type { Finding, VendorRecord, Evidence } from "../types";
import { CONFIG } from "../config";
import { invoicesTotal } from "./util";
import { formatUSD, formatPct } from "../money";
import { addDays, daysBetween, type ISODate } from "../dates";

const RULE_ID = "R09";
const RULE_NAME = "Minimum Commitment Shortfall";

function severityFor(utilization: number): Finding["severity"] {
  if (utilization < 0.5) return "high";
  if (utilization < CONFIG.minCommitUtilizationFlag) return "medium";
  return "watch";
}

function analyze(vendor: VendorRecord, ctx: RuleContext): Finding[] {
  const { contract, invoices } = vendor;
  if (!contract) return [];

  const commitment = contract.commitment;
  const minCommit = commitment?.minCommitSpendCents ?? null;
  // Only spend-based commitments fire here (qty commitments are out of scope).
  if (minCommit == null || minCommit <= 0) return [];
  if (invoices.length === 0) return [];

  // Actual consumption over the measured year = sum of invoice grand totals.
  const actualConsumption = invoicesTotal(invoices);
  const shortfall = Math.max(0, minCommit - actualConsumption);
  if (shortfall <= 0) return [];

  const utilization = actualConsumption / minCommit;
  // Only flag a genuine under-utilization (below the hard threshold).
  if (utilization >= CONFIG.minCommitUtilizationFlag) return [];

  // Right-size the next-term commitment to consumption plus a buffer.
  const rightSized = Math.round(actualConsumption * (1 + CONFIG.rightSizeBufferPct));
  const annualizedSavingsCents = minCommit - rightSized;
  if (annualizedSavingsCents <= 0) return [];

  // Tie the realizable saving to the renewal: the deadline is the notice date,
  // i.e. noticeWindowDays before the contract end (where one exists).
  const deadlineDate: ISODate | null =
    contract.noticeWindowDays && contract.endDate
      ? addDays(contract.endDate, -contract.noticeWindowDays)
      : null;

  const measurementPeriod = commitment?.measurementPeriod ?? "annual";
  const invoiceMin = invoices.reduce(
    (a, i) => Math.min(a, i.totalCents),
    invoices[0].totalCents,
  );
  const invoiceMax = invoices.reduce((a, i) => Math.max(a, i.totalCents), 0);
  const monthlyRunRate = Math.round(actualConsumption / invoices.length);

  const evidence: Evidence[] = [
    {
      label: "Committed annual minimum (take-or-pay floor)",
      value: formatUSD(minCommit),
      sourceDoc: contract.sourceDoc,
    },
    {
      label: `Commitment terms (${measurementPeriod} measurement period)`,
      value: `minCommitSpend ${formatUSD(minCommit)} / ${measurementPeriod}`,
      sourceDoc: contract.sourceDoc,
    },
    {
      label: `Actual consumption (${invoices.length} invoices)`,
      value: `${formatUSD(actualConsumption)} (${formatPct(utilization)} of the floor)`,
      sourceDoc: invoices[0].sourceDoc,
    },
    {
      label: "Monthly run-rate / range",
      value: `${formatUSD(monthlyRunRate)}/mo (low ${formatUSD(invoiceMin)}, high ${formatUSD(invoiceMax)})`,
      sourceDoc: invoices[0].sourceDoc,
    },
    {
      label: "Take-or-pay shortfall (paid, not consumed)",
      value: formatUSD(shortfall),
      sourceDoc: contract.sourceDoc,
    },
    {
      label: "Right-sized commitment (consumption + buffer)",
      value: `${formatUSD(rightSized)} (consumption + ${formatPct(CONFIG.rightSizeBufferPct, 0)} buffer)`,
      sourceDoc: contract.sourceDoc,
    },
  ];

  const renewalNote = deadlineDate
    ? ` Raise this before the renewal notice deadline (${deadlineDate}, ${Math.max(0, daysBetween(ctx.analysisDate, deadlineDate))} days out).`
    : "";

  const summary =
    `${contract.vendorName} carries a ${formatUSD(minCommit)}/yr committed minimum but consumed only ` +
    `${formatUSD(actualConsumption)} (${formatPct(utilization)} utilization) — a ${formatUSD(shortfall)} ` +
    `take-or-pay shortfall paid for and not used. In-term the floor is owed; right-sizing the next-term ` +
    `commitment to ${formatUSD(rightSized)} (consumption + ${formatPct(CONFIG.rightSizeBufferPct, 0)} buffer) ` +
    `recaptures ${formatUSD(annualizedSavingsCents)}/yr.${renewalNote}`;

  const recommendedAsk =
    `Reduce the committed annual minimum from ${formatUSD(minCommit)} to ${formatUSD(rightSized)} ` +
    `at renewal (consumption of ${formatUSD(actualConsumption)} + ${formatPct(CONFIG.rightSizeBufferPct, 0)} buffer), ` +
    `or convert the take-or-pay floor to a drawdown/rollover so unused commit carries forward — ` +
    `a ${formatUSD(annualizedSavingsCents)}/yr right-sizing.`;

  return [
    makeFinding({
      ruleId: RULE_ID,
      ruleName: RULE_NAME,
      category: "minimum_commit",
      vendorId: vendor.vendor.id,
      vendorName: contract.vendorName,
      title: `Over-committed minimum: ${formatPct(utilization)} of a ${formatUSD(minCommit)}/yr floor used`,
      summary,
      savingsType: "avoidance",
      annualizedSavingsCents,
      atRiskCents: shortfall,
      confidence: 0.85,
      severity: severityFor(utilization),
      leverage:
        "A documented multi-period utilization trend is the lever to lower the next-term minimum or " +
        "convert take-or-pay to a drawdown/rollover. Over-commitment also signals the original deal was " +
        "oversold — leverage for additional concessions. Tie to R01 timing: present before the notice deadline.",
      evidence,
      recommendedAsk,
      deadlineDate,
    }),
  ];
}

export default perVendorRule(
  RULE_ID,
  RULE_NAME,
  "minimum_commit",
  analyze,
);

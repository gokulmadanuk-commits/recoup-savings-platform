/**
 * Ranking and portfolio-level rollups. Findings are ranked by annualized
 * savings (the headline number a CFO sorts by); the summary aggregates spend,
 * savings, recovery vs avoidance, and the estimated contingency fee.
 */
import type { Finding, Dataset, AnalysisSummary, VendorRecord } from "../types";
import { AnalysisSummarySchema } from "../types";
import { annualizeCents, sumCents } from "../money";

/** Highest-dollar findings first; ties broken by recovery-over-avoidance then confidence. */
export function rankFindings(findings: Finding[]): Finding[] {
  return [...findings].sort((a, b) => {
    if (b.annualizedSavingsCents !== a.annualizedSavingsCents)
      return b.annualizedSavingsCents - a.annualizedSavingsCents;
    if (a.savingsType !== b.savingsType) return a.savingsType === "recovery" ? -1 : 1;
    return b.confidence - a.confidence;
  });
}

/** Annual spend for a vendor: the contract value, else the annualized invoice run-rate. */
export function vendorAnnualSpendCents(v: VendorRecord): number {
  if (v.contract && v.contract.currentAnnualValueCents > 0)
    return v.contract.currentAnnualValueCents;
  if (v.invoices.length === 0) return 0;
  const avgMonthly = Math.round(
    sumCents(v.invoices.map((i) => i.totalCents)) / v.invoices.length,
  );
  return annualizeCents(avgMonthly, "monthly");
}

export function totalAnnualSpendCents(dataset: Dataset): number {
  return sumCents(dataset.vendors.map(vendorAnnualSpendCents));
}

export function summarize(
  dataset: Dataset,
  findings: Finding[],
  docCounts: { processed: number; failed: number } = { processed: 0, failed: 0 },
): AnalysisSummary {
  const recovery = findings.filter((f) => f.savingsType === "recovery");
  const avoidance = findings.filter((f) => f.savingsType === "avoidance");
  const totalRecoverableCents = sumCents(recovery.map((f) => f.annualizedSavingsCents));
  const totalAvoidanceCents = sumCents(avoidance.map((f) => f.annualizedSavingsCents));
  const totalAnnualizedSavingsCents = totalRecoverableCents + totalAvoidanceCents;
  const estimatedFeeCents = sumCents(findings.map((f) => f.estimatedFeeCents));

  return AnalysisSummarySchema.parse({
    customer: dataset.customer,
    analysisDate: dataset.analysisDate,
    documentsProcessed: docCounts.processed,
    documentsFailed: docCounts.failed,
    vendorsAnalyzed: dataset.vendors.length,
    totalAnnualSpendCents: totalAnnualSpendCents(dataset),
    totalAnnualizedSavingsCents,
    totalRecoverableCents,
    totalAvoidanceCents,
    estimatedFeeCents,
    findingCount: findings.length,
  });
}

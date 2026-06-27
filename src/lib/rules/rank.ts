/**
 * Ranking and portfolio-level rollups. Findings are ranked by annualized
 * savings (the headline number a CFO sorts by); the summary aggregates spend,
 * savings, recovery vs avoidance, and the estimated contingency fee.
 */
import type {
  Finding,
  Dataset,
  AnalysisSummary,
  VendorRecord,
  CategorySummary,
  VendorSummary,
  FindingCategoryT,
} from "../types";
import {
  AnalysisSummarySchema,
  CategorySummarySchema,
  VendorSummarySchema,
} from "../types";
import { annualizeCents, sumCents } from "../money";

export const CATEGORY_LABELS: Record<FindingCategoryT, string> = {
  auto_renewal: "Auto-renewal",
  rate_mismatch: "Off-contract rate",
  unused_seats: "Idle licences",
  price_escalator: "Price escalator",
  overbilling: "Overbilling",
  duplicate: "Duplicate billing",
  missed_discount: "Missed discount",
  tier_optimization: "Right-sizing",
  minimum_commit: "Minimum commitment",
  other: "Other",
};

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
    vendorsWithFindings: new Set(findings.map((f) => f.vendorId)).size,
    totalAnnualSpendCents: totalAnnualSpendCents(dataset),
    totalAnnualizedSavingsCents,
    totalRecoverableCents,
    totalAvoidanceCents,
    estimatedFeeCents,
    findingCount: findings.length,
  });
}

/** Savings rolled up by finding category, richest first. */
export function summarizeCategories(findings: Finding[]): CategorySummary[] {
  const map = new Map<string, { count: number; savings: number; recoverable: number; avoidance: number }>();
  for (const f of findings) {
    const e = map.get(f.category) ?? { count: 0, savings: 0, recoverable: 0, avoidance: 0 };
    e.count += 1;
    e.savings += f.annualizedSavingsCents;
    if (f.savingsType === "recovery") e.recoverable += f.annualizedSavingsCents;
    else e.avoidance += f.annualizedSavingsCents;
    map.set(f.category, e);
  }
  return [...map.entries()]
    .map(([category, e]) =>
      CategorySummarySchema.parse({
        category,
        label: CATEGORY_LABELS[category as FindingCategoryT] ?? category,
        count: e.count,
        savingsCents: e.savings,
        recoverableCents: e.recoverable,
        avoidanceCents: e.avoidance,
      }),
    )
    .sort((a, b) => b.savingsCents - a.savingsCents);
}

/** Per-vendor rollup (spend, savings, finding count), richest savings first. */
export function summarizeVendors(dataset: Dataset, findings: Finding[]): VendorSummary[] {
  const byVendor = new Map<string, Finding[]>();
  for (const f of findings) {
    const a = byVendor.get(f.vendorId) ?? [];
    a.push(f);
    byVendor.set(f.vendorId, a);
  }
  return dataset.vendors
    .map((v) => {
      const fs = byVendor.get(v.vendor.id) ?? [];
      return VendorSummarySchema.parse({
        id: v.vendor.id,
        name: v.vendor.name,
        category: v.vendor.category,
        annualSpendCents: vendorAnnualSpendCents(v),
        savingsCents: sumCents(fs.map((f) => f.annualizedSavingsCents)),
        recoverableCents: sumCents(fs.filter((f) => f.savingsType === "recovery").map((f) => f.annualizedSavingsCents)),
        avoidanceCents: sumCents(fs.filter((f) => f.savingsType === "avoidance").map((f) => f.annualizedSavingsCents)),
        findingCount: fs.length,
      });
    })
    .sort((a, b) => b.savingsCents - a.savingsCents);
}

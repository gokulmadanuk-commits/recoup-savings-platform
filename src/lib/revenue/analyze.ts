/**
 * Revenue analysis pipeline — mirror of ../analyze, seller-side. Runs the rule
 * set, scores the collections queue, rolls up the portfolio, and pre-drafts the
 * top customer notices. analyzeRevenueDataset works on the in-memory canonical
 * dataset (the instant /api/revenue/sample path); analyzeRevenueFiles parses an
 * uploaded set of documents first.
 */
import {
  RevenueAnalysisResultSchema,
  type RevenueAnalysisResult,
  type RevenueDataset,
  type RevenueFinding,
} from "./types";
import type { RevenueRule } from "./rules/types";
import { runRevenueRules } from "./rules/runner";
import {
  summarizeRevenueCategories,
  summarizeCustomers,
  summarizePriceIncreases,
  customerContractRevenueCents,
} from "./rules/rank";
import { scoreCollections, summarizeARAging } from "./collections";
import { draftRevenueEmailsForTop } from "./email/draft";
import { revenueContractClauses } from "./docmodel/to-docmodel";
import { assembleRevenueDataset, type AssemblyFailure } from "./docmodel/from-docmodel";
import { parseBatch, type InputFile } from "../parsing/index";
import { SELLER_NAME } from "./types";

export interface DocCounts {
  processed: number;
  failed: number;
}

export function analyzeRevenueDataset(
  dataset: RevenueDataset,
  rules: RevenueRule[],
  docCounts: DocCounts,
  topEmails = 10,
): RevenueAnalysisResult {
  const findings: RevenueFinding[] = runRevenueRules(rules, dataset);
  const collections = scoreCollections(dataset);
  const arAging = summarizeARAging(dataset);

  const totalContractRevenueCents = dataset.customers.reduce(
    (a, c) => a + customerContractRevenueCents(c),
    0,
  );
  const totalArrearsCents = findings.reduce((a, f) => a + f.arrearsToDateCents, 0);
  const totalAnnualizedUpliftCents = findings.reduce(
    (a, f) => a + f.annualizedUpliftCents,
    0,
  );
  const totalRecoverableCents = findings.reduce(
    (a, f) => a + f.totalRecoverableCents,
    0,
  );
  const estimatedFeeCents = findings.reduce((a, f) => a + f.estimatedFeeCents, 0);
  const customersWithFindings = new Set(findings.map((f) => f.customerId)).size;
  const totalExpectedRecoverableCents = collections.reduce(
    (a, c) => a + c.ervCents,
    0,
  );

  const summary = {
    seller: dataset.seller,
    analysisDate: dataset.analysisDate,
    documentsProcessed: docCounts.processed,
    documentsFailed: docCounts.failed,
    customersAnalyzed: dataset.customers.length,
    customersWithFindings,
    totalContractRevenueCents,
    totalArrearsCents,
    totalAnnualizedUpliftCents,
    totalRecoverableCents,
    estimatedFeeCents,
    findingCount: findings.length,
    totalOpenARCents: arAging.totalOpenCents,
    totalExpectedRecoverableCents,
    dso: arAging.dso,
  };

  return RevenueAnalysisResultSchema.parse({
    summary,
    findings,
    drafts: draftRevenueEmailsForTop(findings, topEmails),
    categories: summarizeRevenueCategories(findings),
    customers: summarizeCustomers(dataset, findings),
    documents: [], // hydrated from the manifest by the API / generator
    priceIncreases: summarizePriceIncreases(dataset, dataset.analysisDate),
    collections,
    arAging,
  });
}

export interface RevenueAnalyzeResult {
  result: RevenueAnalysisResult;
  failures: AssemblyFailure[];
}

/** Parse uploaded documents into a dataset, then analyze (live-upload path). */
export async function analyzeRevenueFiles(
  files: InputFile[],
  rules: RevenueRule[],
  opts: { seller?: string; analysisDate: string } & { topEmails?: number },
): Promise<RevenueAnalyzeResult> {
  const batch = await parseBatch(files);
  const failures: AssemblyFailure[] = batch.failures.map((f) => ({
    fileName: f.fileName,
    reason: f.reason,
  }));
  const dataset = assembleRevenueDataset(
    batch.documents,
    opts.seller ?? SELLER_NAME,
    opts.analysisDate,
    failures,
  );
  const result = analyzeRevenueDataset(
    dataset,
    rules,
    { processed: batch.processed, failed: batch.failed },
    opts.topEmails ?? 10,
  );
  return { result, failures };
}

/** Contract-clause prose for the document viewer (customer_contract docs only). */
export function clausesForRevenue(
  dataset: RevenueDataset,
  customerId: string,
  docType: string,
): { heading: string; body: string }[] {
  if (docType !== "customer_contract") return [];
  const record = dataset.customers.find((c) => c.customer.id === customerId);
  if (!record?.contract) return [];
  return revenueContractClauses(record.contract);
}

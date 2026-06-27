/**
 * The end-to-end analysis pipeline: parse a batch of uploaded documents, assemble
 * them into the canonical dataset, run the detection rules, draft the top vendor
 * emails, roll everything up (summary, category + vendor breakdowns, a document +
 * clause index), and return it. Rules are injected so the pipeline is testable
 * and the registry stays a single source of truth.
 */
import { parseBatch, type InputFile } from "./parsing/index";
import { assembleDataset, type AssemblyFailure } from "./docmodel/from-docmodel";
import { contractClauses } from "./docmodel/to-docmodel";
import { slug } from "./docmodel/serialize";
import { runRules } from "./rules/runner";
import { makeContext, type Rule } from "./rules/types";
import { summarize, summarizeCategories, summarizeVendors } from "./rules/rank";
import { draftEmailsForTop } from "./email/draft";
import { ANALYSIS_DATE } from "./config";
import {
  DocumentSummarySchema,
  type AnalysisResult,
  type Dataset,
  type DocumentSummary,
  type ParsedDocument,
} from "./types";

export interface AnalyzeOptions {
  customer?: string;
  analysisDate?: string;
  topEmails?: number;
}

export interface AnalyzeResult extends AnalysisResult {
  failures: { fileName: string; reason: string }[];
}

/** Standard clause prose for a vendor's contract (regenerated from its terms). */
export function clausesFor(dataset: Dataset, vendorId: string, docType: string) {
  if (docType !== "contract") return [];
  const v = dataset.vendors.find((x) => x.vendor.id === vendorId);
  return v?.contract ? contractClauses(v.contract) : [];
}

/** Build the document index from parsed documents (the live-upload path). */
export function documentsFromParsed(
  parsed: ParsedDocument[],
  dataset: Dataset,
  sizeByName: Map<string, number> = new Map(),
): DocumentSummary[] {
  return parsed.map((d) => {
    const vendorId = slug(d.vendorName);
    return DocumentSummarySchema.parse({
      vendorId,
      vendorName: d.vendorName,
      docType: d.docType,
      format: d.format,
      fileName: d.fileName,
      path: null,
      sizeBytes: sizeByName.get(d.fileName) ?? null,
      clauses: clausesFor(dataset, vendorId, d.docType),
    });
  });
}

/** Run the detection engine over an already-assembled dataset. */
export function analyzeDataset(
  dataset: Dataset,
  rules: Rule[],
  docCounts: { processed: number; failed: number } = { processed: 0, failed: 0 },
  topEmails = 10,
): AnalysisResult {
  const findings = runRules(rules, makeContext(dataset));
  return {
    summary: summarize(dataset, findings, docCounts),
    findings,
    drafts: draftEmailsForTop(findings, topEmails),
    categories: summarizeCategories(findings),
    vendors: summarizeVendors(dataset, findings),
    documents: [],
  };
}

/** Parse uploaded files, then analyze. The whole journey from raw bytes to ranked findings. */
export async function analyzeFiles(
  files: InputFile[],
  rules: Rule[],
  opts: AnalyzeOptions = {},
): Promise<AnalyzeResult> {
  const batch = await parseBatch(files);
  const assemblyFailures: AssemblyFailure[] = [];
  const dataset = assembleDataset(
    batch.documents,
    opts.customer ?? "Your Company",
    opts.analysisDate ?? ANALYSIS_DATE,
    assemblyFailures,
  );
  const failures = [...batch.failures, ...assemblyFailures];
  const result = analyzeDataset(
    dataset,
    rules,
    { processed: batch.processed - failures.length, failed: failures.length },
    opts.topEmails ?? 10,
  );
  const sizeByName = new Map(files.map((f) => [f.fileName, f.data.byteLength]));
  const documents = documentsFromParsed(batch.documents, dataset, sizeByName);
  return { ...result, documents, failures };
}

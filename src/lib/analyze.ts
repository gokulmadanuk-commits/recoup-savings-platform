/**
 * The end-to-end analysis pipeline: parse a batch of uploaded documents, assemble
 * them into the canonical dataset, run the detection rules, draft the top vendor
 * emails, and roll everything up. Rules are injected so the pipeline is testable
 * and the registry stays a single source of truth.
 */
import { parseBatch, type InputFile } from "./parsing/index";
import { assembleDataset } from "./docmodel/from-docmodel";
import { runRules } from "./rules/runner";
import { makeContext, type Rule } from "./rules/types";
import { summarize } from "./rules/rank";
import { draftEmailsForTop } from "./email/draft";
import { ANALYSIS_DATE } from "./config";
import type { AnalysisResult, Dataset } from "./types";

export interface AnalyzeOptions {
  customer?: string;
  analysisDate?: string;
  topEmails?: number;
}

export interface AnalyzeResult extends AnalysisResult {
  failures: { fileName: string; reason: string }[];
}

/** Run the detection engine over an already-assembled dataset. */
export function analyzeDataset(
  dataset: Dataset,
  rules: Rule[],
  docCounts: { processed: number; failed: number } = { processed: 0, failed: 0 },
  topEmails = 10,
): AnalysisResult {
  const findings = runRules(rules, makeContext(dataset));
  const drafts = draftEmailsForTop(findings, topEmails);
  const summary = summarize(dataset, findings, docCounts);
  return { summary, findings, drafts };
}

/** Parse uploaded files, then analyze. The whole journey from raw bytes to ranked findings. */
export async function analyzeFiles(
  files: InputFile[],
  rules: Rule[],
  opts: AnalyzeOptions = {},
): Promise<AnalyzeResult> {
  const batch = await parseBatch(files);
  const dataset = assembleDataset(
    batch.documents,
    opts.customer ?? "Your Company",
    opts.analysisDate ?? ANALYSIS_DATE,
  );
  const result = analyzeDataset(
    dataset,
    rules,
    { processed: batch.processed, failed: batch.failed },
    opts.topEmails ?? 10,
  );
  return { ...result, failures: batch.failures };
}

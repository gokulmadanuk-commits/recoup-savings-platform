/**
 * Generates the downloadable synthetic REVENUE corpus into public/revenue-seed/
 * (customer contracts as PDF/Word, billing exports as PDF/Excel, statements of
 * account as Excel), then parses every generated file back through the dispatcher
 * as a "hundreds of documents without dying" stress test — and re-runs the engine
 * over the PARSED-BACK dataset to prove parse→detect reproduces the answer key.
 * Writes manifest.json, ground-truth.json and analysis.json alongside.
 *
 *   npm run seed:revenue
 */
import { mkdir, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import {
  CUSTOMER_SEEDS,
  revenueSeedDataset,
  REVENUE_EXPECTED,
} from "../src/lib/revenue/seed/index";
import { customerRecordToDocModels } from "../src/lib/revenue/docmodel/to-docmodel";
import { assembleRevenueDataset } from "../src/lib/revenue/docmodel/from-docmodel";
import { analyzeRevenueDataset } from "../src/lib/revenue/analyze";
import { ALL_REVENUE_RULES } from "../src/lib/revenue/rules/index";
import { renderPdf } from "../src/lib/render/pdf";
import { renderExcel } from "../src/lib/render/excel";
import { renderWord } from "../src/lib/render/word";
import { parseBatch, type InputFile } from "../src/lib/parsing/index";
import { brandFor, type Brand } from "../src/lib/brand";
import { toDollars } from "../src/lib/money";
import type { DocModel } from "../src/lib/types";

type Fmt = "pdf" | "excel" | "word";
const EXT: Record<Fmt, string> = { pdf: "pdf", excel: "xlsx", word: "docx" };

function chooseFormat(doc: DocModel, segment: string): Fmt {
  // Statements carry the wide AR + work-order tables → Excel.
  if (doc.docType === "ar_aging") return "excel";
  const s = segment.toLowerCase();
  if (doc.docType === "customer_contract") {
    return /manufactur|warehous|cold|pharma|building/.test(s) ? "word" : "pdf";
  }
  // billing_export
  return /distribution|wholesale|grocery|beverage|courier/.test(s) ? "excel" : "pdf";
}

async function render(doc: DocModel, fmt: Fmt, brand: Brand): Promise<Uint8Array> {
  if (fmt === "pdf") return renderPdf(doc, brand);
  if (fmt === "excel") return renderExcel(doc, brand);
  return renderWord(doc, brand);
}

interface ManifestDoc {
  docType: DocModel["docType"];
  format: Fmt;
  fileName: string;
  path: string;
  bytes: number;
}

async function main() {
  const root = join(process.cwd(), "public", "revenue-seed");
  await rm(root, { recursive: true, force: true });
  await mkdir(root, { recursive: true });

  const dataset = revenueSeedDataset();
  const allFiles: InputFile[] = [];
  const customers: {
    id: string;
    name: string;
    segment: string;
    docs: ManifestDoc[];
  }[] = [];
  let totalBytes = 0;

  for (const { record } of CUSTOMER_SEEDS) {
    const cid = record.customer.id;
    const dir = join(root, cid);
    await mkdir(dir, { recursive: true });
    const docs = customerRecordToDocModels(record);
    const brand = brandFor(record.customer.name, record.customer.segment);
    const manifestDocs: ManifestDoc[] = [];

    for (const doc of docs) {
      const fmt = chooseFormat(doc, record.customer.segment);
      const base = doc.fileName.replace(/\.[^.]+$/, "");
      const fileName = `${base}.${EXT[fmt]}`;
      const bytes = await render(doc, fmt, brand);
      await writeFile(join(dir, fileName), bytes);
      totalBytes += bytes.byteLength;
      allFiles.push({ fileName, data: bytes });
      manifestDocs.push({
        docType: doc.docType,
        format: fmt,
        fileName,
        path: `/revenue-seed/${cid}/${fileName}`,
        bytes: bytes.byteLength,
      });
    }
    customers.push({
      id: cid,
      name: record.customer.name,
      segment: record.customer.segment,
      docs: manifestDocs,
    });
    process.stdout.write(`  ${record.customer.name}: ${docs.length} docs\n`);
  }

  // Stress-test: parse every generated file back through the dispatcher.
  process.stdout.write(`\nParsing ${allFiles.length} generated documents back...\n`);
  const t0 = Date.now();
  const batch = await parseBatch(allFiles, 8);
  const ms = Date.now() - t0;

  const byFormat = allFiles.reduce<Record<string, number>>((a, f) => {
    const ext = f.fileName.split(".").pop()!;
    a[ext] = (a[ext] ?? 0) + 1;
    return a;
  }, {});

  const manifest = {
    seller: dataset.seller,
    analysisDate: dataset.analysisDate,
    generatedAt: new Date().toISOString().slice(0, 10),
    fileCount: allFiles.length,
    totalBytes,
    byFormat,
    customers,
  };
  await writeFile(join(root, "manifest.json"), JSON.stringify(manifest, null, 2));

  const groundTruth = {
    seller: dataset.seller,
    analysisDate: dataset.analysisDate,
    customerCount: dataset.customers.length,
    expectedFindingCount: REVENUE_EXPECTED.length,
    expectedTotalUsd: REVENUE_EXPECTED.reduce(
      (a, e) => a + toDollars(e.totalRecoverableCents),
      0,
    ),
    expectedFindings: REVENUE_EXPECTED,
  };
  await writeFile(
    join(root, "ground-truth.json"),
    JSON.stringify(groundTruth, null, 2),
  );

  // Run the engine over the PARSED-BACK documents (proving parse→detect).
  const parsedDataset = assembleRevenueDataset(
    batch.documents,
    dataset.seller,
    dataset.analysisDate,
  );
  const analysis = analyzeRevenueDataset(parsedDataset, ALL_REVENUE_RULES, {
    processed: batch.processed,
    failed: batch.failed,
  });
  await writeFile(join(root, "analysis.json"), JSON.stringify(analysis, null, 2));

  process.stdout.write(
    `\n=== generated ${allFiles.length} files (${(totalBytes / 1024 / 1024).toFixed(1)} MB) ` +
      `[${Object.entries(byFormat).map(([k, v]) => `${v} ${k}`).join(", ")}]\n` +
      `=== parsed back: ${batch.succeeded} ok, ${batch.failed} failed in ${ms} ms\n` +
      `=== parsed-back analysis: $${Math.round(toDollars(analysis.summary.totalRecoverableCents)).toLocaleString()} recoverable across ${analysis.summary.findingCount} findings\n` +
      `=== answer key: ${REVENUE_EXPECTED.length} findings, $${Math.round(groundTruth.expectedTotalUsd).toLocaleString()} recoverable\n`,
  );

  let failed = false;
  if (batch.failed > 0) {
    process.stdout.write(`!!! parse failures:\n`);
    for (const f of batch.failures.slice(0, 20))
      process.stdout.write(`    ${f.fileName}: ${f.reason}\n`);
    failed = true;
  }
  if (analysis.summary.findingCount !== REVENUE_EXPECTED.length) {
    process.stdout.write(
      `!!! parse→detect mismatch: parsed-back analysis found ${analysis.summary.findingCount} findings, expected ${REVENUE_EXPECTED.length}\n`,
    );
    failed = true;
  }
  if (failed) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

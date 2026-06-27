/**
 * Generates the downloadable synthetic corpus into public/seed/ with a realistic
 * format mix (contracts as PDF or Word; invoices as PDF or Excel for line-heavy
 * categories; utilization exports as Excel), then parses every generated file
 * back through the dispatcher as a "hundreds of documents without dying" stress
 * test. Writes manifest.json and ground-truth.json alongside.
 *
 *   npm run seed
 */
import { mkdir, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { SEEDS, seedDataset, EXPECTED } from "../src/lib/seed/index";
import { vendorRecordToDocModels } from "../src/lib/docmodel/to-docmodel";
import { slug } from "../src/lib/docmodel/serialize";
import { renderPdf } from "../src/lib/render/pdf";
import { renderExcel } from "../src/lib/render/excel";
import { renderWord } from "../src/lib/render/word";
import { parseBatch, type InputFile } from "../src/lib/parsing/index";
import { assembleDataset } from "../src/lib/docmodel/from-docmodel";
import { analyzeDataset } from "../src/lib/analyze";
import { ALL_RULES } from "../src/lib/rules/index";
import { brandFor, type Brand } from "../src/lib/brand";
import { toDollars } from "../src/lib/money";
import type { DocModel } from "../src/lib/types";

type Fmt = "pdf" | "excel" | "word";
const EXT: Record<Fmt, string> = { pdf: "pdf", excel: "xlsx", word: "docx" };

function chooseFormat(doc: DocModel, category: string): Fmt {
  if (doc.docType === "usage_export") return "excel";
  const c = category.toLowerCase();
  if (doc.docType === "contract") {
    return /facilit|janitor|ground|security|market|agency|professional|cyber/.test(c) ? "word" : "pdf";
  }
  return /cloud|hosting|telecom|wireless|utilit/.test(c) ? "excel" : "pdf";
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
  const root = join(process.cwd(), "public", "seed");
  await rm(root, { recursive: true, force: true });
  await mkdir(root, { recursive: true });

  const dataset = seedDataset();
  const allFiles: InputFile[] = [];
  const vendors: { id: string; name: string; category: string; docs: ManifestDoc[] }[] = [];
  let totalBytes = 0;

  for (const { record } of SEEDS) {
    const vid = record.vendor.id;
    const dir = join(root, vid);
    await mkdir(dir, { recursive: true });
    const docs = vendorRecordToDocModels(record);
    const brand = brandFor(record.vendor.name, record.vendor.category);
    const manifestDocs: ManifestDoc[] = [];

    for (const doc of docs) {
      const fmt = chooseFormat(doc, record.vendor.category);
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
        path: `/seed/${vid}/${fileName}`,
        bytes: bytes.byteLength,
      });
    }
    vendors.push({ id: vid, name: record.vendor.name, category: record.vendor.category, docs: manifestDocs });
    process.stdout.write(`  ${record.vendor.name}: ${docs.length} docs\n`);
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
    customer: dataset.customer,
    analysisDate: dataset.analysisDate,
    generatedAt: new Date().toISOString().slice(0, 10),
    fileCount: allFiles.length,
    totalBytes,
    byFormat,
    vendors,
  };
  await writeFile(join(root, "manifest.json"), JSON.stringify(manifest, null, 2));

  const groundTruth = {
    customer: dataset.customer,
    analysisDate: dataset.analysisDate,
    vendorCount: dataset.vendors.length,
    expectedFindingCount: EXPECTED.length,
    expectedTotalUsd: EXPECTED.reduce((a, e) => a + toDollars(e.annualizedSavingsCents), 0),
    expectedFindings: EXPECTED,
  };
  await writeFile(join(root, "ground-truth.json"), JSON.stringify(groundTruth, null, 2));

  // Run the full engine over the PARSED-BACK documents (proving parse->detect)
  // and persist the precomputed analysis for the instant "load sample" path.
  const parsedDataset = assembleDataset(batch.documents, dataset.customer, dataset.analysisDate);
  const analysis = analyzeDataset(parsedDataset, ALL_RULES, {
    processed: batch.processed,
    failed: batch.failed,
  });
  await writeFile(join(root, "analysis.json"), JSON.stringify(analysis, null, 2));
  process.stdout.write(
    `=== analysis: $${Math.round(toDollars(analysis.summary.totalAnnualizedSavingsCents)).toLocaleString()}/yr across ${analysis.summary.findingCount} findings (from parsed docs)\n`,
  );

  process.stdout.write(
    `\n=== generated ${allFiles.length} files (${(totalBytes / 1024 / 1024).toFixed(1)} MB) ` +
      `[${Object.entries(byFormat).map(([k, v]) => `${v} ${k}`).join(", ")}]\n` +
      `=== parsed back: ${batch.succeeded} ok, ${batch.failed} failed in ${ms} ms\n` +
      `=== answer key: ${EXPECTED.length} findings, $${Math.round(groundTruth.expectedTotalUsd).toLocaleString()}/yr\n`,
  );
  if (batch.failed > 0) {
    process.stdout.write(`!!! parse failures:\n`);
    for (const f of batch.failures.slice(0, 20)) process.stdout.write(`    ${f.fileName}: ${f.reason}\n`);
    process.exitCode = 1;
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

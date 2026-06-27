/**
 * Parsing dispatcher. Routes a file to the right format parser by extension and
 * makes batch parsing resilient: concurrency-bounded, and one bad document can
 * never abort the run (Promise.allSettled + per-file try/catch). This is the
 * "reads hundreds of PDFs without dying" guarantee.
 */
import pLimit from "p-limit";
import { ParsedDocumentSchema, type ParsedDocument } from "../types";
import { parsePdf } from "./pdf";
import { parseExcel } from "./excel";
import { parseWord } from "./word";

export interface InputFile {
  fileName: string;
  data: Uint8Array;
}

export function extensionOf(name: string): string {
  const m = name.toLowerCase().match(/\.([a-z0-9]+)$/);
  return m ? m[1] : "";
}

function failedDoc(fileName: string, reason: string): ParsedDocument {
  return ParsedDocumentSchema.parse({
    docType: "contract",
    format: "pdf",
    vendorName: "Unknown",
    title: fileName,
    fields: [],
    tables: [],
    clauses: [],
    fileName,
    parseConfidence: 0,
    warnings: [reason],
    parseStatus: "failed",
  });
}

/** Parse one file by extension; never throws — returns a 'failed' doc instead. */
export async function parseFile(file: InputFile): Promise<ParsedDocument> {
  const ext = extensionOf(file.fileName);
  try {
    switch (ext) {
      case "pdf":
        return await parsePdf(file.data, file.fileName);
      case "xlsx":
      case "xls":
        return await parseExcel(file.data, file.fileName);
      case "docx":
      case "doc":
        return await parseWord(file.data, file.fileName);
      default:
        return failedDoc(file.fileName, `Unsupported file type: .${ext || "(none)"}`);
    }
  } catch (e) {
    return failedDoc(file.fileName, e instanceof Error ? e.message : String(e));
  }
}

export interface BatchResult {
  /** Successfully parsed documents (status ok or partial). */
  documents: ParsedDocument[];
  failures: { fileName: string; reason: string }[];
  processed: number;
  succeeded: number;
  failed: number;
}

/** Parse many files concurrently; isolates failures so the batch always completes. */
export async function parseBatch(
  files: InputFile[],
  concurrency = 6,
): Promise<BatchResult> {
  const limit = pLimit(concurrency);
  const settled = await Promise.allSettled(
    files.map((f) => limit(() => parseFile(f))),
  );

  const documents: ParsedDocument[] = [];
  const failures: { fileName: string; reason: string }[] = [];
  settled.forEach((r, i) => {
    if (r.status === "fulfilled") {
      const doc = r.value;
      if (doc.parseStatus === "failed") {
        failures.push({ fileName: doc.fileName, reason: doc.warnings[0] ?? "parse failed" });
      } else {
        documents.push(doc);
      }
    } else {
      failures.push({
        fileName: files[i]?.fileName ?? "unknown",
        reason: r.reason instanceof Error ? r.reason.message : String(r.reason),
      });
    }
  });

  return {
    documents,
    failures,
    processed: files.length,
    succeeded: documents.length,
    failed: failures.length,
  };
}

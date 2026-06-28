/**
 * PDF -> ParsedDocument, via unpdf's bundled pdf.js. We read positioned text
 * runs (getTextContent: each item carries a transform with x/y and a width),
 * cluster them into rows by y and into columns by nearest column-x, and rebuild
 * the title, the "Label: value" field block, and every table emitted by
 * render/pdf.ts. The pairing is a strict round-trip: parse(render(doc)) must
 * reproduce doc.fields and doc.tables exactly.
 */
import { getResolvedPDFJS } from "unpdf";
import {
  ParsedDocumentSchema,
  type ParsedDocument,
  type DocField,
  type DocTable,
  type DocModel,
} from "../types";

const TABLE_CAPTION = /^\[Table\]\s+(.+)$/;
/** Marks the start of render-only clause prose; ends all table collection. */
const CLAUSES_SENTINEL = "[Clauses]";

/** A single positioned text run from the PDF. */
interface Run {
  str: string;
  x: number;
  y: number;
  page: number;
}

/** A row of runs that share a y-band on one page, left-to-right. */
interface Row {
  runs: Run[];
  /** Representative y (max of member ys). */
  y: number;
  page: number;
}

export async function parsePdf(data: Uint8Array, fileName: string): Promise<ParsedDocument> {
  const warnings: string[] = [];
  let rows: Row[] = [];

  try {
    rows = await extractRows(data);
  } catch (err) {
    return ParsedDocumentSchema.parse({
      docType: "contract",
      format: "pdf",
      vendorName: "",
      title: "",
      fields: [],
      tables: [],
      clauses: [],
      fileName,
      parseConfidence: 0,
      warnings: [`PDF extraction failed: ${(err as Error).message}`],
      parseStatus: "failed",
    });
  }

  // The first row is the title only if it isn't actually a field / table /
  // clause line — otherwise a title-less document would swallow its first field.
  let cursor = 0;
  let title = "";
  if (rows.length === 0) {
    warnings.push("No text rows extracted");
  } else {
    const first = rows[0];
    const lead = first.runs[0]?.str.trim() ?? "";
    const looksStructural =
      parseFieldRow(first) !== null || TABLE_CAPTION.test(lead) || lead === CLAUSES_SENTINEL;
    if (!looksStructural) {
      title = rowText(first);
      cursor = 1;
    }
  }

  const fields: DocField[] = [];
  const tables: DocTable[] = [];

  while (cursor < rows.length) {
    const row = rows[cursor];
    const lead = row.runs[0]?.str ?? "";

    // Everything from the clause sentinel onward is render-only prose.
    if (lead.trim() === CLAUSES_SENTINEL) break;

    const captionMatch = TABLE_CAPTION.exec(lead.trim());
    if (captionMatch) {
      const { table, next } = readTable(rows, cursor, captionMatch[1].trim());
      tables.push(table);
      cursor = next;
      continue;
    }

    // A field row: leading run is a "Label:" cell. If it doesn't look like a
    // field (no trailing colon on the first cell), treat it as clause prose and
    // stop collecting fields/tables for this region.
    const field = parseFieldRow(row);
    if (field) {
      fields.push(field);
      cursor += 1;
      continue;
    }

    // Non-field, non-table line (clause prose or stray) — skip it.
    cursor += 1;
  }

  const docType = detectDocType(fields);
  const vendorName = fieldValue(fields, "Vendor") ?? "";

  if (!vendorName) warnings.push("Vendor field not found");

  return ParsedDocumentSchema.parse({
    docType,
    format: "pdf",
    vendorName,
    title,
    fields,
    tables,
    clauses: [],
    fileName,
    parseConfidence: warnings.length === 0 ? 1 : 0.8,
    warnings,
    parseStatus: warnings.length === 0 ? "ok" : "partial",
  });
}

/* ------------------------------------------------------------------ */
/* Extraction                                                          */
/* ------------------------------------------------------------------ */

async function extractRows(data: Uint8Array): Promise<Row[]> {
  const pdfjs = await getResolvedPDFJS();
  const task = pdfjs.getDocument({
    data,
    // Keep pdf.js quiet and self-contained under Node/serverless.
    useSystemFonts: false,
    isEvalSupported: false,
  });
  const pdf = await task.promise;
  const allRows: Row[] = [];

  try {
    for (let p = 1; p <= pdf.numPages; p++) {
      const page = await pdf.getPage(p);
      try {
        const content = await page.getTextContent();
        const runs: Run[] = [];
        for (const item of content.items) {
          // pdf.js text items: { str, transform: [a,b,c,d,e,f], width, height }.
          if (!("str" in item)) continue;
          const str = item.str;
          if (str.trim() === "") continue; // drop word-spacing fillers / blanks
          const transform = item.transform as number[];
          runs.push({ str, x: transform[4], y: transform[5], page: p });
        }
        allRows.push(...clusterRows(runs, p));
      } finally {
        page.cleanup();
      }
    }
  } finally {
    await task.destroy();
  }

  // Order: by page, then top-to-bottom (PDF y grows upward, so descending y).
  allRows.sort((a, b) => (a.page !== b.page ? a.page - b.page : b.y - a.y));
  return allRows;
}

/** Group runs on one page into rows by y proximity. */
function clusterRows(runs: Run[], page: number): Row[] {
  const Y_TOL = 4; // points; a single drawn line shares y within rounding
  const sorted = [...runs].sort((a, b) => b.y - a.y || a.x - b.x);
  const rows: Row[] = [];
  for (const run of sorted) {
    const existing = rows.find((r) => Math.abs(r.y - run.y) <= Y_TOL);
    if (existing) {
      existing.runs.push(run);
      existing.y = Math.max(existing.y, run.y);
    } else {
      rows.push({ runs: [run], y: run.y, page });
    }
  }
  for (const r of rows) r.runs.sort((a, b) => a.x - b.x);
  return rows;
}

/* ------------------------------------------------------------------ */
/* Field rows                                                          */
/* ------------------------------------------------------------------ */

/**
 * A field row is "<Label>:" at the left, then the value at a fixed value-x.
 * We split on the run whose text ends with ":" (the label cell), join any
 * leading runs as the label, and join the rest as the value.
 */
function parseFieldRow(row: Row): DocField | null {
  const runs = row.runs;
  if (runs.length === 0) return null;

  // Find the label run: the first run ending in ":" within the left region.
  let labelEnd = -1;
  for (let i = 0; i < runs.length; i++) {
    if (runs[i].str.trimEnd().endsWith(":")) {
      labelEnd = i;
      break;
    }
  }
  if (labelEnd === -1) return null;

  const labelRuns = runs.slice(0, labelEnd + 1);
  const valueRuns = runs.slice(labelEnd + 1);

  let label = labelRuns.map((r) => r.str).join("").trim();
  label = label.replace(/:\s*$/, "").trim();
  if (!label) return null;

  const value = valueRuns.map((r) => r.str).join("").trim();
  return { label, value };
}

/* ------------------------------------------------------------------ */
/* Tables                                                              */
/* ------------------------------------------------------------------ */

/**
 * Read a table starting at the caption row index. The next row is the header
 * (its run x-positions define the column anchors); subsequent rows are data
 * until the next caption / a field row / end. Continuation header rows (a row
 * whose cells equal the column names) are skipped.
 */
function readTable(
  rows: Row[],
  captionIdx: number,
  name: string,
): { table: DocTable; next: number } {
  let i = captionIdx + 1;
  if (i >= rows.length) {
    return { table: { name, columns: [], rows: [] }, next: i };
  }

  // Header row defines columns AND the x-anchor for each column.
  const headerRow = rows[i];
  const anchors = headerRow.runs.map((r) => r.x);
  const columns = headerRow.runs.map((r) => r.str.trim());
  i += 1;

  const dataRows: string[][] = [];
  for (; i < rows.length; i++) {
    const row = rows[i];
    const lead = row.runs[0]?.str.trim() ?? "";

    // A table runs until the next table caption, the clause sentinel, or EOF —
    // explicit boundaries the renderer always emits (fields are rendered BEFORE
    // tables). We deliberately do NOT terminate on a field-row heuristic, which
    // would silently truncate a table at a sparse data row whose first cell ends
    // in a colon.
    if (TABLE_CAPTION.test(lead) || lead === CLAUSES_SENTINEL) break;

    const cells = rowToCells(row, anchors, columns.length);

    // Skip a repeated header (page-continuation) row.
    if (isHeaderRow(cells, columns)) continue;

    dataRows.push(cells);
  }

  return { table: { name, columns, rows: dataRows }, next: i };
}

/** Assign each run in the row to its nearest column anchor; join per column. */
function rowToCells(row: Row, anchors: number[], colCount: number): string[] {
  const cells: string[][] = Array.from({ length: colCount }, () => []);
  for (const run of row.runs) {
    const col = nearestAnchor(run.x, anchors);
    if (cells[col]) cells[col].push(run.str);
  }
  return cells.map((parts) => parts.join("").trim());
}

function nearestAnchor(x: number, anchors: number[]): number {
  let best = 0;
  let bestDist = Infinity;
  for (let i = 0; i < anchors.length; i++) {
    const d = Math.abs(anchors[i] - x);
    if (d < bestDist) {
      bestDist = d;
      best = i;
    }
  }
  return best;
}

function isHeaderRow(cells: string[], columns: string[]): boolean {
  if (cells.length !== columns.length) return false;
  return cells.every((c, idx) => c === columns[idx]);
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function rowText(row: Row): string {
  return row.runs
    .map((r) => r.str)
    .join("")
    .trim();
}

function fieldValue(fields: DocField[], label: string): string | undefined {
  return fields.find((f) => f.label === label)?.value;
}

function detectDocType(fields: DocField[]): DocModel["docType"] {
  const has = (label: string) => fields.some((f) => f.label === label);
  // Revenue-leakage (seller-side) docs carry unique header fields so PDFs
  // round-trip their docType without a marker. Check these first.
  if (has("Billing Document No.")) return "billing_export";
  if (has("AR Statement Date")) return "ar_aging";
  if (has("Seller")) return "customer_contract";
  // Cost-side (buyer) docs.
  if (has("Invoice Number")) return "invoice";
  if (has("Export Type")) return "usage_export";
  return "contract";
}

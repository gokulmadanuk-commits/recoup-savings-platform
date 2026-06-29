/**
 * .xlsx (exceljs) -> ParsedDocument. The exact inverse of `renderExcel`.
 *
 * Reads the single "Document" sheet, walking rows top-to-bottom:
 *   - the `__docType` / `__vendorName` marker rows give provenance,
 *   - the "Field | Value" header opens the fields section (every subsequent
 *     2-column row is a field until a "TABLE: " marker is hit),
 *   - each "TABLE: <name>" marker opens a table: the next non-empty row is the
 *     column header, and the following rows (until the next marker / EOF) are
 *     data rows.
 *
 * Every cell value is coerced to its trimmed text form, matching the
 * trimming the round-trip contract allows.
 */
import ExcelJS from "exceljs";
import {
  ParsedDocumentSchema,
  type ParsedDocument,
  type DocField,
  type DocTable,
  type DocModel,
} from "../types";
import { T } from "../docmodel/labels";
import {
  SHEET_NAME,
  DOCTYPE_MARKER,
  VENDOR_MARKER,
  FIELDS_HEADER,
  FIELDS_VALUE_HEADER,
  TABLE_MARKER_PREFIX,
} from "../render/excel";

/** Render any exceljs cell value down to the plain text it represents. */
function cellText(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object") {
    const v = value as unknown as Record<string, unknown>;
    // Rich text: { richText: [{ text }, ...] }
    if (Array.isArray(v.richText)) {
      return (v.richText as { text?: string }[]).map((p) => p.text ?? "").join("");
    }
    // Hyperlink: { text, hyperlink }
    if (typeof v.text === "string") return v.text;
    // Formula: { formula, result }
    if ("result" in v && v.result != null) return String(v.result);
    if (typeof v.hyperlink === "string") return v.hyperlink;
  }
  return String(value);
}

/** Read one worksheet row into a dense string[] indexed by (col-1). */
function rowCells(row: ExcelJS.Row): string[] {
  const out: string[] = [];
  const count = row.cellCount; // highest populated column in this row
  for (let c = 1; c <= count; c += 1) {
    out.push(cellText(row.getCell(c).value).trim());
  }
  return out;
}

/** A row is "blank" when it has no non-empty cell. */
function isBlank(cells: string[]): boolean {
  return cells.every((c) => c === "");
}

const KNOWN_TABLE_NAMES = new Set<string>(Object.values(T).map((t) => t.name));

/** Structural fallback for docType when the marker is absent. */
function detectDocType(tableNames: string[]): DocModel["docType"] {
  if (tableNames.includes(T.usage.name)) return "usage_export";
  if (tableNames.includes(T.lineItems.name)) return "invoice";
  if (tableNames.includes(T.rateCard.name) || tableNames.includes(T.tiers.name)) {
    return "contract";
  }
  return "contract";
}

export async function parseExcel(
  data: Uint8Array,
  fileName: string,
): Promise<ParsedDocument> {
  const warnings: string[] = [];
  const wb = new ExcelJS.Workbook();
  // exceljs.load accepts a Buffer; its bundled @types/node uses an older Buffer
  // shape than the project's, so cast through the parameter type.
  await wb.xlsx.load(
    Buffer.from(data) as unknown as Parameters<typeof wb.xlsx.load>[0],
  );

  const ws = wb.getWorksheet(SHEET_NAME) ?? wb.worksheets[0];
  if (!ws) {
    return ParsedDocumentSchema.parse({
      docType: "contract",
      format: "excel",
      vendorName: "",
      title: "",
      fields: [],
      tables: [],
      clauses: [],
      fileName,
      parseConfidence: 0,
      warnings: ["No worksheet found in workbook"],
      parseStatus: "failed",
    });
  }

  // Collect every row as a dense string[] keyed by 1-based row number.
  const rows: { n: number; cells: string[] }[] = [];
  ws.eachRow({ includeEmpty: false }, (row, n) => {
    rows.push({ n, cells: rowCells(row) });
  });

  let title = "";
  let docTypeMarker: string | null = null;
  let vendorMarker: string | null = null;
  const fields: DocField[] = [];
  const tables: DocTable[] = [];

  // Mode machine: 'pre' (before fields header) -> 'fields' -> 'table'.
  type Mode = "pre" | "fields" | "table";
  let mode: Mode = "pre";
  let current: DocTable | null = null;
  let expectHeader = false; // next non-blank row in a table is its column header

  const flushTable = () => {
    if (current) {
      tables.push(current);
      current = null;
    }
  };

  for (let i = 0; i < rows.length; i += 1) {
    const { cells } = rows[i];

    // Title: first row, single leading text cell, before any marker.
    if (i === 0 && mode === "pre" && cells[0] && cells[0] !== DOCTYPE_MARKER) {
      title = cells[0];
      continue;
    }

    const first = cells[0] ?? "";

    if (first === DOCTYPE_MARKER) {
      docTypeMarker = cells[1] ?? "";
      continue;
    }
    if (first === VENDOR_MARKER) {
      vendorMarker = cells[1] ?? "";
      continue;
    }

    // Table marker opens a new table in any mode.
    if (first.startsWith(TABLE_MARKER_PREFIX)) {
      flushTable();
      const name = first.slice(TABLE_MARKER_PREFIX.length);
      current = { name, columns: [], rows: [] };
      mode = "table";
      expectHeader = true;
      continue;
    }

    // Fields section opener.
    if (
      mode !== "table" &&
      first === FIELDS_HEADER &&
      (cells[1] ?? "") === FIELDS_VALUE_HEADER
    ) {
      mode = "fields";
      continue;
    }

    if (mode === "fields") {
      if (isBlank(cells)) continue;
      // label / value pair (value may legitimately be empty).
      fields.push({ label: first, value: cells[1] ?? "" });
      continue;
    }

    if (mode === "table" && current) {
      if (isBlank(cells)) continue; // spacer rows inside/around tables
      if (expectHeader) {
        current.columns = trimTrailingEmpty(cells);
        expectHeader = false;
        continue;
      }
      // Data row: normalize to the column count.
      const width = current.columns.length;
      const padded: string[] = [];
      for (let c = 0; c < width; c += 1) padded.push(cells[c] ?? "");
      current.rows.push(padded);
      continue;
    }

    // mode === 'pre' and the row is neither title nor marker: ignore.
  }
  flushTable();

  const tableNames = tables.map((t) => t.name);
  const VALID_DOCTYPES = new Set<string>([
    "contract",
    "invoice",
    "usage_export",
    "customer_contract",
    "billing_export",
    "ar_aging",
  ]);
  const docType =
    docTypeMarker && VALID_DOCTYPES.has(docTypeMarker)
      ? (docTypeMarker as DocModel["docType"])
      : detectDocType(tableNames);

  if (!docTypeMarker) {
    warnings.push("docType marker missing; inferred from table structure");
  }
  for (const n of tableNames) {
    if (!KNOWN_TABLE_NAMES.has(n)) {
      warnings.push(`Unrecognized table name: ${n}`);
    }
  }

  const vendorName = vendorMarker ?? "";

  const parsed = {
    docType,
    format: "excel" as const,
    vendorName,
    title,
    fields,
    tables,
    clauses: [],
    fileName,
    parseConfidence: warnings.length === 0 ? 1 : 0.9,
    warnings,
    parseStatus: "ok" as const,
  };

  return ParsedDocumentSchema.parse(parsed);
}

/** Drop trailing empty header cells (column headers are always non-empty). */
function trimTrailingEmpty(cells: string[]): string[] {
  const out = [...cells];
  while (out.length > 0 && out[out.length - 1] === "") out.pop();
  return out;
}

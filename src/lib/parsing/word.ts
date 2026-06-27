/**
 * .docx (Word) -> ParsedDocument. Parses documents produced by
 * ../render/word.ts: mammoth converts the .docx to HTML, then node-html-parser
 * walks the HTML to recover fields ("Label: value" paragraphs) and tables
 * (a [[TABLE: name]] caption followed by a real <table>). Marker paragraphs
 * carry docType + vendorName so detection never depends on field presence.
 *
 * Clauses are render-only and are intentionally NOT reconstructed.
 */
import mammoth from "mammoth";
import { parse as parseHtml, type HTMLElement } from "node-html-parser";
import {
  ParsedDocumentSchema,
  type ParsedDocument,
  type DocField,
  type DocTable,
} from "../types";
import { DOCTYPE_MARKER, VENDOR_MARKER, TABLE_MARKER } from "../render/word";

type DocType = ParsedDocument["docType"];

/** Pull the payload out of a "[[PREFIX: payload]]" marker, or null. */
function readMarker(text: string, prefix: string): string | null {
  const t = text.trim();
  if (!t.startsWith(prefix)) return null;
  const body = t.slice(prefix.length).replace(/\]\]\s*$/, "");
  return body.trim();
}

function cellText(el: HTMLElement): string {
  // node-html-parser decodes entities; collapse the single inner <p> (or empty
  // cell) to its text and trim — trimming each cell is allowed by the contract.
  return el.text.trim();
}

function parseTable(tableEl: HTMLElement, name: string): DocTable {
  const trs = tableEl.querySelectorAll("tr");
  const rowsCells: string[][] = trs.map((tr) => {
    const cells = tr.querySelectorAll("th, td");
    return cells.map(cellText);
  });
  const [headerRow, ...dataRows] = rowsCells;
  return {
    name,
    columns: headerRow ?? [],
    rows: dataRows,
  };
}

function detectDocType(
  marker: string | null,
  fields: DocField[],
  tables: DocTable[],
): DocType {
  if (marker === "contract" || marker === "invoice" || marker === "usage_export") {
    return marker;
  }
  // Fallback heuristics if the marker is missing (defensive only).
  const labels = new Set(fields.map((f) => f.label));
  if (labels.has("Invoice Number")) return "invoice";
  if (labels.has("Export Type") || tables.some((t) => t.name === "Usage Records")) {
    return "usage_export";
  }
  return "contract";
}

export async function parseWord(
  data: Uint8Array,
  fileName: string,
): Promise<ParsedDocument> {
  const warnings: string[] = [];

  const { value: html } = await mammoth.convertToHtml({
    buffer: Buffer.from(data),
  });
  const root = parseHtml(html);

  let title = "";
  let docTypeMarker: string | null = null;
  let vendorMarker: string | null = null;
  const fields: DocField[] = [];
  const tables: DocTable[] = [];

  // Top-level body children, in document order. A [[TABLE: name]] paragraph is
  // immediately followed by its <table>, so we look ahead when we see one.
  const nodes = root.childNodes.filter(
    (n): n is HTMLElement => (n as HTMLElement).tagName !== undefined,
  );

  let pendingTableName: string | null = null;

  for (const node of nodes) {
    const tag = node.tagName.toLowerCase();

    if (tag === "h1") {
      if (!title) title = node.text.trim();
      continue;
    }

    if (tag === "table") {
      const name = pendingTableName ?? `Table ${tables.length + 1}`;
      tables.push(parseTable(node, name));
      pendingTableName = null;
      continue;
    }

    if (tag === "p") {
      const text = node.text;

      const dt = readMarker(text, DOCTYPE_MARKER);
      if (dt !== null) {
        docTypeMarker = dt;
        continue;
      }
      const vn = readMarker(text, VENDOR_MARKER);
      if (vn !== null) {
        vendorMarker = vn;
        continue;
      }
      const tn = readMarker(text, TABLE_MARKER);
      if (tn !== null) {
        pendingTableName = tn;
        continue;
      }

      // A field line: "Label: value". Split on the FIRST ":" only, so values
      // that themselves contain ":" stay intact, and an empty value (the line
      // collapses to "Label:" once HTML trims the trailing space) still parses.
      const trimmed = text.trim();
      const sepIdx = trimmed.indexOf(":");
      if (sepIdx > 0) {
        const label = trimmed.slice(0, sepIdx).trim();
        const value = trimmed.slice(sepIdx + 1).trim();
        fields.push({ label, value });
      }
      continue;
    }

    // h2 (clause headings) and anything else are render-only — skip.
  }

  const docType = detectDocType(docTypeMarker, fields, tables);
  const vendorMatch = fields.find((f) => f.label === "Vendor");
  const vendorName = vendorMarker ?? vendorMatch?.value ?? "";

  if (!docTypeMarker) warnings.push("docType marker missing; inferred from content");
  if (!vendorMarker && !vendorMatch) warnings.push("vendor not found");

  return ParsedDocumentSchema.parse({
    docType,
    format: "word",
    vendorName,
    title,
    fields,
    tables,
    clauses: [],
    fileName,
    parseConfidence: warnings.length ? 0.9 : 1,
    warnings,
    parseStatus: warnings.length ? "partial" : "ok",
  });
}

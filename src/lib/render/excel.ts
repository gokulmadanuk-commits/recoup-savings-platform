/**
 * DocModel -> .xlsx (exceljs). The Excel counterpart of the PDF/Word renderers.
 *
 * Layout (single "Document" sheet so we never trip over Excel's 31-char /
 * reserved-char sheet-name rules for arbitrary table names):
 *
 *   Row 1            title (merged, bold)  <- MUST be the first text-bearing row
 *   letterhead       vendor name + (template-dependent) chrome rows
 *   markers          __docType / __vendorName provenance rows
 *   (blank)
 *   FIELDS section   a bold "Field | Value" header, then one row per field
 *   (blank)
 *   per table:       a bold "TABLE: <name>" marker row,
 *                    a styled column-header row,
 *                    one row per data row,
 *                    a trailing blank row
 *
 * BRANDING is purely visual chrome layered on top of that layout: a coloured
 * monogram badge, the vendor name in the brand colour, brand-coloured rules,
 * a tinted "Field | Value" header and tinted table-header rows, plus a footer
 * remittance line. `brand.template` (0|1|2) only changes WHERE the chrome sits
 * (classic centred / left band / minimal top-rule) — never the structured text.
 *
 * The hard invariant the round-trip relies on:
 *   - the title is the FIRST row exceljs yields, with the title in column 1
 *     (so no styled-but-empty row may precede it — exceljs still emits those),
 *   - the "__docType"/"__vendorName" markers, the "Field"/"Value" header pair,
 *     the "TABLE: <name>" markers, and every field/column/cell keep their TEXT,
 *   - every cell is written as STRING text ("@") so values such as "$48.60",
 *     "$1,250.00" or "" survive the round-trip with no reformatting.
 * `parseExcel` is the exact inverse of this layout; chrome cells it doesn't read
 * are placed where it provably ignores them (later columns of the title row, and
 * non-sentinel rows in the pre-fields zone).
 */
import ExcelJS from "exceljs";
import type { DocModel } from "../types";
import { type Brand, brandFor } from "../brand";

/** Marker prefixes the parser keys off. Chosen so they can't collide with a
 *  legitimate field label or column name. */
export const SHEET_NAME = "Document";
export const DOCTYPE_MARKER = "__docType";
export const VENDOR_MARKER = "__vendorName";
export const FIELDS_HEADER = "Field";
export const FIELDS_VALUE_HEADER = "Value";
export const TABLE_MARKER_PREFIX = "TABLE: ";

const WHITE = "FFFFFFFF";
const INK = "FF1F2937"; // slate-800, default body ink

/** "#1D4ED8" -> "FF1D4ED8" (exceljs ARGB). Falls back to a neutral on bad input. */
function argb(hex: string): string {
  const m = /^#?([0-9a-fA-F]{6})$/.exec(hex.trim());
  return m ? `FF${m[1].toUpperCase()}` : "FF1F3A2E";
}

/** Force a cell to be stored/typed as text so exceljs never coerces it. */
function textCell(cell: ExcelJS.Cell, value: string): void {
  // Assigning a plain string makes exceljs store it as a string/sharedString.
  cell.value = value;
  // Belt-and-braces: a text number format stops any consumer reformatting it.
  cell.numFmt = "@";
}

/** Solid fill helper. */
function fill(cell: ExcelJS.Cell, hex: string): void {
  cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: hex } };
}

export async function renderExcel(
  doc: DocModel,
  brand: Brand = brandFor(doc.vendorName),
): Promise<Uint8Array> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "ledger-savings-platform";
  const ws = wb.addWorksheet(SHEET_NAME, {
    views: [{ showGridLines: false }], // cleaner, letterhead-style canvas
  });
  ws.properties.defaultColWidth = 24;

  const BRAND = argb(brand.hex);
  const TINT = argb(brand.tintHex);
  // A spread for the letterhead/table bands. The line-items/usage tables run up
  // to 11 columns; spanning the chrome across that keeps it from looking cramped.
  const SPAN = 7;

  let r = 1;

  /* ----------------------------------------------------------------- */
  /* LETTERHEAD — three template variants keyed off brand.template.     */
  /* The title MUST remain the first text-bearing row, in column 1, so  */
  /* every variant writes the title there first; only the surrounding   */
  /* chrome (badge placement, bands, rules) differs.                    */
  /* ----------------------------------------------------------------- */

  // Row 1: the title row (parser reads cells[0] of the first row as the title).
  const titleRow = r;
  const titleCell = ws.getCell(r, 1);
  textCell(titleCell, doc.title);
  ws.getRow(r).height = 26;

  if (brand.template === 1) {
    // Variant 1 — MODERN LEFT BAND: a full brand-colour band across the title
    // row with the monogram badge top-left (col 1) and the title reversed
    // (white) beside it. Title text stays in col 1; the badge sits in col 1's
    // band visually via the row fill, and the initials ride in the next column.
    ws.mergeCells(titleRow, 1, titleRow, SPAN);
    titleCell.font = { bold: true, size: 16, color: { argb: WHITE } };
    titleCell.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
    for (let c = 1; c <= SPAN; c += 1) fill(ws.getCell(titleRow, c), BRAND);
  } else if (brand.template === 2) {
    // Variant 2 — MINIMAL TOP-RULE: plain title in the brand colour with a
    // heavy brand rule beneath; a compact monogram badge to the right.
    titleCell.font = { bold: true, size: 16, color: { argb: BRAND } };
    titleCell.alignment = { vertical: "middle", horizontal: "left" };
    ws.mergeCells(titleRow, 1, titleRow, 4);
    // Monogram badge, right side of the letterhead.
    const badge = ws.getCell(titleRow, SPAN);
    textCell(badge, brand.initials);
    badge.font = { bold: true, size: 14, color: { argb: WHITE } };
    badge.alignment = { vertical: "middle", horizontal: "center" };
    fill(badge, BRAND);
  } else {
    // Variant 0 — CLASSIC CENTRED LETTERHEAD: title centred in the brand colour
    // across the page with a monogram badge as a coloured square in the last
    // column. The title must stay in col 1 (the parser reads it there), so the
    // monogram rides the right edge rather than col 1 (which would hijack the
    // parsed title).
    titleCell.font = { bold: true, size: 18, color: { argb: BRAND } };
    titleCell.alignment = { vertical: "middle", horizontal: "center" };
    ws.mergeCells(titleRow, 1, titleRow, SPAN - 1);
    const mark = ws.getCell(titleRow, SPAN);
    textCell(mark, brand.initials);
    mark.font = { bold: true, size: 14, color: { argb: WHITE } };
    mark.alignment = { vertical: "middle", horizontal: "center" };
    fill(mark, BRAND);
  }
  r += 1;

  // Letterhead line 2: vendor name in the brand colour + a thin brand rule.
  // This row sits in the parser's "pre" zone and is provably ignored (it is not
  // row 0, not a marker, not the Field/Value header) — pure visual chrome.
  const vendorLine = ws.getCell(r, 1);
  textCell(vendorLine, doc.vendorName);
  vendorLine.font = { bold: true, size: 11, color: { argb: BRAND } };
  ws.mergeCells(r, 1, r, SPAN);
  // Thin brand-colour rule beneath the vendor name (the letterhead rule).
  for (let c = 1; c <= SPAN; c += 1) {
    ws.getCell(r, c).border = {
      bottom: { style: brand.template === 2 ? "thick" : "thin", color: { argb: BRAND } },
    };
  }
  ws.getRow(r).height = 18;
  r += 1;

  // A small breathing spacer below the letterhead rule.
  r += 1;

  /* ----------------------------------------------------------------- */
  /* PROVENANCE MARKERS (recovered verbatim; not part of fields/tables).*/
  /* ----------------------------------------------------------------- */
  const docTypeCell = ws.getCell(r, 1);
  textCell(docTypeCell, DOCTYPE_MARKER);
  textCell(ws.getCell(r, 2), doc.docType);
  // Mute the provenance markers visually so they read as metadata, not content.
  docTypeCell.font = { size: 8, color: { argb: "FF9CA3AF" } };
  ws.getCell(r, 2).font = { size: 8, color: { argb: "FF9CA3AF" } };
  r += 1;
  const vendCell = ws.getCell(r, 1);
  textCell(vendCell, VENDOR_MARKER);
  textCell(ws.getCell(r, 2), doc.vendorName);
  vendCell.font = { size: 8, color: { argb: "FF9CA3AF" } };
  ws.getCell(r, 2).font = { size: 8, color: { argb: "FF9CA3AF" } };
  r += 1;

  // Spacer.
  r += 1;

  /* ----------------------------------------------------------------- */
  /* FIELDS section — header tinted with the brand colour.              */
  /* ----------------------------------------------------------------- */
  const fhLabel = ws.getCell(r, 1);
  const fhValue = ws.getCell(r, 2);
  textCell(fhLabel, FIELDS_HEADER);
  textCell(fhValue, FIELDS_VALUE_HEADER);
  const fieldHeaderFont = { bold: true, color: { argb: BRAND } } as const;
  fhLabel.font = fieldHeaderFont;
  fhValue.font = fieldHeaderFont;
  // Tint the two header cells and underline them with the brand colour.
  fill(fhLabel, TINT);
  fill(fhValue, TINT);
  for (const c of [fhLabel, fhValue]) {
    c.border = { bottom: { style: "thin", color: { argb: BRAND } } };
    c.alignment = { vertical: "middle" };
  }
  r += 1;

  for (let i = 0; i < doc.fields.length; i += 1) {
    const f = doc.fields[i];
    const labelCell = ws.getCell(r, 1);
    const valueCell = ws.getCell(r, 2);
    textCell(labelCell, f.label);
    textCell(valueCell, f.value);
    // Bold the label, plain the value — and zebra-tint alternate rows for a
    // realistic ledger feel. Both remain plain text and round-trip verbatim.
    labelCell.font = { bold: true, color: { argb: INK } };
    valueCell.font = { color: { argb: INK } };
    if (i % 2 === 1) {
      fill(labelCell, TINT);
      fill(valueCell, TINT);
    }
    r += 1;
  }

  /* ----------------------------------------------------------------- */
  /* TABLES — branded header rows + zebra data rows.                    */
  /* ----------------------------------------------------------------- */
  for (const t of doc.tables) {
    r += 1; // blank spacer before each table

    const markerCell = ws.getCell(r, 1);
    textCell(markerCell, `${TABLE_MARKER_PREFIX}${t.name}`);
    // Section heading in the brand colour (the marker TEXT is unchanged).
    markerCell.font = { bold: true, size: 12, color: { argb: BRAND } };
    r += 1;

    // Column header row: brand-tint fill + brand-colour font + a brand bottom
    // rule. TEXT of each header is untouched.
    const headerRowNum = r;
    t.columns.forEach((col, i) => {
      const c = ws.getCell(r, i + 1);
      textCell(c, col);
      c.font = { bold: true, color: { argb: BRAND } };
      fill(c, TINT);
      c.border = { bottom: { style: "medium", color: { argb: BRAND } } };
      c.alignment = { vertical: "middle" };
    });
    ws.getRow(headerRowNum).height = 18;
    r += 1;

    // Data rows. Cells are written explicitly (including empty strings) so the
    // column count is preserved even when trailing cells are blank. Alternate
    // rows get a faint tint band — chrome only; the cell text is verbatim.
    for (let ri = 0; ri < t.rows.length; ri += 1) {
      const row = t.rows[ri];
      const zebra = ri % 2 === 1;
      for (let i = 0; i < t.columns.length; i += 1) {
        const c = ws.getCell(r, i + 1);
        textCell(c, row[i] ?? "");
        c.font = { color: { argb: INK } };
        if (zebra) fill(c, TINT);
      }
      r += 1;
    }
  }

  /* ----------------------------------------------------------------- */
  /* FOOTER — a brand-tinted remittance line (render-only chrome).       */
  /* CRITICAL: the Document-sheet table zone runs to EOF (there is no     */
  /* end-of-table sentinel in the Excel parser), so any non-blank row     */
  /* after the last table would be swallowed as a phantom data row. The   */
  /* footer therefore lives on its OWN sheet, which the parser never      */
  /* reads (it only parses SHEET_NAME), keeping the round-trip exact.     */
  /* ----------------------------------------------------------------- */
  {
    const fs = wb.addWorksheet("Remittance", {
      views: [{ showGridLines: false }],
    });
    fs.properties.defaultColWidth = 24;
    const badge = fs.getCell(1, 1);
    textCell(badge, brand.initials);
    badge.font = { bold: true, size: 14, color: { argb: WHITE } };
    badge.alignment = { vertical: "middle", horizontal: "center" };
    fill(badge, BRAND);
    const heading = fs.getCell(1, 2);
    textCell(heading, doc.vendorName);
    heading.font = { bold: true, size: 12, color: { argb: BRAND } };
    heading.alignment = { vertical: "middle" };
    fs.getRow(1).height = 22;

    const footer = fs.getCell(3, 1);
    textCell(
      footer,
      `Remit to ${doc.vendorName} — please reference the document title on all payments.`,
    );
    footer.font = { italic: true, size: 9, color: { argb: INK } };
    fs.mergeCells(3, 1, 3, SPAN);
    for (let c = 1; c <= SPAN; c += 1) {
      fill(fs.getCell(3, c), TINT);
      fs.getCell(3, c).border = {
        top: { style: "thin", color: { argb: BRAND } },
      };
    }
  }

  // Render clauses (render-only — never parsed back). Kept on a separate sheet
  // so they don't interfere with the structured Document sheet.
  if (doc.clauses.length) {
    const cs = wb.addWorksheet("Clauses", {
      views: [{ showGridLines: false }],
    });
    cs.properties.defaultColWidth = 80;
    let cr = 1;
    // A small branded banner for the clauses sheet too.
    const banner = cs.getCell(cr, 1);
    textCell(banner, `${doc.vendorName} — Terms & Conditions`);
    banner.font = { bold: true, size: 12, color: { argb: WHITE } };
    fill(banner, BRAND);
    banner.alignment = { vertical: "middle", indent: 1 };
    cs.getRow(cr).height = 22;
    cr += 2;
    for (const clause of doc.clauses) {
      const h = cs.getCell(cr, 1);
      textCell(h, clause.heading);
      h.font = { bold: true, color: { argb: BRAND } };
      cr += 1;
      const body = cs.getCell(cr, 1);
      textCell(body, clause.body);
      body.font = { color: { argb: INK } };
      body.alignment = { wrapText: true, vertical: "top" };
      cr += 2;
    }
  }

  const buf = await wb.xlsx.writeBuffer();
  return new Uint8Array(buf as ArrayBuffer);
}

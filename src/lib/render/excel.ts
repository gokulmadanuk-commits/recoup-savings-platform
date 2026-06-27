/**
 * DocModel -> .xlsx (exceljs). The Excel counterpart of the PDF/Word renderers.
 *
 * Layout (single "Document" sheet so we never trip over Excel's 31-char /
 * reserved-char sheet-name rules for arbitrary table names):
 *
 *   Row 1            title (merged, bold)
 *   Row 2            blank
 *   FIELDS section   a bold "Field | Value" header, then one row per field
 *   (blank)
 *   per table:       a bold "TABLE: <name>" marker row,
 *                    a bold column-header row,
 *                    one row per data row,
 *                    a trailing blank row
 *
 * Every cell is written as a STRING (never a number/date) so values such as
 * "$48.60", "$1,250.00" or "" survive the round-trip with no reformatting.
 * `parseExcel` is the exact inverse of this layout.
 */
import ExcelJS from "exceljs";
import type { DocModel } from "../types";

/** Marker prefixes the parser keys off. Chosen so they can't collide with a
 *  legitimate field label or column name. */
export const SHEET_NAME = "Document";
export const DOCTYPE_MARKER = "__docType";
export const VENDOR_MARKER = "__vendorName";
export const FIELDS_HEADER = "Field";
export const FIELDS_VALUE_HEADER = "Value";
export const TABLE_MARKER_PREFIX = "TABLE: ";

/** Force a cell to be stored/typed as text so exceljs never coerces it. */
function textCell(cell: ExcelJS.Cell, value: string): void {
  // Assigning a plain string makes exceljs store it as a string/sharedString.
  cell.value = value;
  // Belt-and-braces: a text number format stops any consumer reformatting it.
  cell.numFmt = "@";
}

export async function renderExcel(doc: DocModel): Promise<Uint8Array> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "ledger-savings-platform";
  const ws = wb.addWorksheet(SHEET_NAME);
  ws.properties.defaultColWidth = 24;

  let r = 1;

  // Title row.
  const titleCell = ws.getCell(r, 1);
  textCell(titleCell, doc.title);
  titleCell.font = { bold: true, size: 14 };
  r += 1;

  // Provenance markers (recovered verbatim; not part of fields/tables).
  textCell(ws.getCell(r, 1), DOCTYPE_MARKER);
  textCell(ws.getCell(r, 2), doc.docType);
  r += 1;
  textCell(ws.getCell(r, 1), VENDOR_MARKER);
  textCell(ws.getCell(r, 2), doc.vendorName);
  r += 1;

  // Spacer.
  r += 1;

  // FIELDS section header.
  const fhLabel = ws.getCell(r, 1);
  const fhValue = ws.getCell(r, 2);
  textCell(fhLabel, FIELDS_HEADER);
  textCell(fhValue, FIELDS_VALUE_HEADER);
  fhLabel.font = { bold: true };
  fhValue.font = { bold: true };
  r += 1;

  for (const f of doc.fields) {
    textCell(ws.getCell(r, 1), f.label);
    textCell(ws.getCell(r, 2), f.value);
    r += 1;
  }

  // Tables.
  for (const t of doc.tables) {
    r += 1; // blank spacer before each table

    const markerCell = ws.getCell(r, 1);
    textCell(markerCell, `${TABLE_MARKER_PREFIX}${t.name}`);
    markerCell.font = { bold: true };
    r += 1;

    // Column header row (bold for realism).
    t.columns.forEach((col, i) => {
      const c = ws.getCell(r, i + 1);
      textCell(c, col);
      c.font = { bold: true };
    });
    r += 1;

    // Data rows. Cells are written explicitly (including empty strings) so the
    // column count is preserved even when trailing cells are blank.
    for (const row of t.rows) {
      for (let i = 0; i < t.columns.length; i += 1) {
        textCell(ws.getCell(r, i + 1), row[i] ?? "");
      }
      r += 1;
    }
  }

  // Render clauses (render-only — never parsed back). Kept on a separate sheet
  // so they don't interfere with the structured Document sheet.
  if (doc.clauses.length) {
    const cs = wb.addWorksheet("Clauses");
    cs.properties.defaultColWidth = 80;
    let cr = 1;
    for (const clause of doc.clauses) {
      const h = cs.getCell(cr, 1);
      textCell(h, clause.heading);
      h.font = { bold: true };
      cr += 1;
      textCell(cs.getCell(cr, 1), clause.body);
      cr += 2;
    }
  }

  const buf = await wb.xlsx.writeBuffer();
  return new Uint8Array(buf as ArrayBuffer);
}

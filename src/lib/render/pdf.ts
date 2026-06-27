/**
 * DocModel -> PDF, via pdfkit. The layout is deliberately positional: every
 * field value and every table cell is drawn at a FIXED x-coordinate for its
 * column, with line-wrapping disabled, so the companion parser (parsing/pdf.ts)
 * can rebuild rows by clustering text runs by y and columns by nearest column-x.
 *
 * Column x-positions are computed from each column's measured max content width
 * plus a fixed gap, so adjacent cells never touch — that gap is what stops
 * pdf.js from merging two cells into one text run on extraction. The page is
 * LETTER landscape to give wide finance tables (up to ~11 columns) the room they
 * need without shrinking the font.
 *
 * This is the generate half of the round-trip self-test: parse(render(doc)) must
 * reproduce doc.fields and doc.tables exactly. Clauses are render-only prose.
 */
import PDFDocument from "pdfkit";
import type { DocModel } from "../types";

/* ------------------------------------------------------------------ */
/* Layout constants — shared with the parser only by coordinate value, */
/* never by import (the parser recovers geometry, not these numbers).   */
/* ------------------------------------------------------------------ */

const MARGIN = 50;
/** LETTER landscape: 792pt wide x 612pt tall. */
const PAGE_W = 792;
const PAGE_H = 612;
const CONTENT_LEFT = MARGIN;
const CONTENT_RIGHT = PAGE_W - MARGIN; // 742
const CONTENT_WIDTH = CONTENT_RIGHT - CONTENT_LEFT; // 692

const TITLE_SIZE = 16;
const HEADING_SIZE = 11;
const BODY_SIZE = 9;
const FIELD_VALUE_X = CONTENT_LEFT + 190; // fixed x for the "value" column of fields
const LINE_H = 15; // vertical step between field/table rows
const SECTION_GAP = 14;

/** Horizontal gap between columns — guarantees a whitespace run so pdf.js never
 * merges two adjacent cells into a single text item. */
const COL_GAP = 14;
/** Floor width for any column (keeps anchors well separated even for empties). */
const MIN_COL_W = 24;

/** Bottom y at which we start a fresh page (keep a margin of safety). */
const PAGE_BOTTOM = PAGE_H - MARGIN; // 562

type Doc = PDFKit.PDFDocument;

export async function renderPdf(doc: DocModel): Promise<Uint8Array> {
  return await new Promise<Uint8Array>((resolve, reject) => {
    const pdf: Doc = new PDFDocument({
      size: [PAGE_W, PAGE_H],
      margin: MARGIN,
    });
    const chunks: Buffer[] = [];
    pdf.on("data", (c: Buffer) => chunks.push(c));
    pdf.on("end", () => resolve(new Uint8Array(Buffer.concat(chunks))));
    pdf.on("error", reject);

    try {
      drawDocument(pdf, doc);
      pdf.end();
    } catch (err) {
      reject(err as Error);
    }
  });
}

function drawDocument(pdf: Doc, doc: DocModel): void {
  let y = CONTENT_LEFT; // top y (PDFKit uses top-left origin in the drawing API)

  // Title (bold).
  pdf.font("Helvetica-Bold").fontSize(TITLE_SIZE);
  pdf.text(doc.title, CONTENT_LEFT, y, { width: CONTENT_WIDTH, lineBreak: true });
  y = pdf.y + SECTION_GAP;

  // Field header block — each field as "Label:  value" with the value at a fixed x.
  y = drawFields(pdf, doc, y);

  // Tables.
  for (const table of doc.tables) {
    y = ensureSpace(pdf, y, LINE_H * 3);
    y += SECTION_GAP;
    y = drawTable(pdf, table.name, table.columns, table.rows, y);
  }

  // Clauses (render-only prose, contracts only).
  if (doc.clauses.length) {
    y = ensureSpace(pdf, y, LINE_H * 3);
    y += SECTION_GAP;
    // Sentinel: marks the end of all tables so the parser stops collecting
    // table rows before the free-prose clause section begins.
    pdf.font("Helvetica-Bold").fontSize(HEADING_SIZE);
    pdf.text("[Clauses]", CONTENT_LEFT, y, { lineBreak: false });
    y += LINE_H + 2;
    for (const clause of doc.clauses) {
      y = ensureSpace(pdf, y, LINE_H * 2);
      pdf.font("Helvetica-Bold").fontSize(HEADING_SIZE);
      pdf.text(clause.heading, CONTENT_LEFT, y, { width: CONTENT_WIDTH });
      y = pdf.y + 2;
      pdf.font("Helvetica").fontSize(BODY_SIZE);
      pdf.text(clause.body, CONTENT_LEFT, y, { width: CONTENT_WIDTH, align: "left" });
      y = pdf.y + SECTION_GAP / 2;
    }
  }
}

/** Draw the labelled field block. Returns the new y cursor. */
function drawFields(pdf: Doc, doc: DocModel, startY: number): number {
  let y = startY;
  for (const field of doc.fields) {
    y = ensureSpace(pdf, y, LINE_H);
    pdf.font("Helvetica-Bold").fontSize(BODY_SIZE);
    // Label drawn at the left anchor with a trailing colon (single unbroken run).
    pdf.text(`${field.label}:`, CONTENT_LEFT, y, { lineBreak: false });
    // Value drawn at the fixed value-x so the parser can recover it by column.
    if (field.value !== "") {
      pdf.font("Helvetica").fontSize(BODY_SIZE);
      pdf.text(field.value, FIELD_VALUE_X, y, { lineBreak: false });
    }
    y += LINE_H;
  }
  return y;
}

/**
 * Compute the left x-anchor of each column from the measured max content width
 * of that column (header + every cell), plus a fixed inter-column gap. If the
 * natural widths overflow the content box, scale them down proportionally so the
 * table still fits — the gap (and thus the no-merge guarantee) is preserved.
 */
function computeColumnXs(pdf: Doc, columns: string[], rows: string[][]): number[] {
  const n = columns.length;
  const widths = new Array<number>(n).fill(MIN_COL_W);

  const measure = (text: string, bold: boolean) => {
    pdf.font(bold ? "Helvetica-Bold" : "Helvetica").fontSize(BODY_SIZE);
    return pdf.widthOfString(text);
  };

  for (let i = 0; i < n; i++) {
    widths[i] = Math.max(widths[i], measure(columns[i] ?? "", true));
  }
  for (const row of rows) {
    for (let i = 0; i < n; i++) {
      const cell = row[i];
      if (cell) widths[i] = Math.max(widths[i], measure(cell, false));
    }
  }

  // Total natural width including gaps.
  const totalGap = COL_GAP * Math.max(n - 1, 0);
  let totalContent = widths.reduce((a, b) => a + b, 0);
  const available = CONTENT_WIDTH - totalGap;
  if (totalContent > available && totalContent > 0) {
    const scale = available / totalContent;
    for (let i = 0; i < n; i++) widths[i] = Math.max(widths[i] * scale, MIN_COL_W);
    totalContent = widths.reduce((a, b) => a + b, 0);
  }

  const xs = new Array<number>(n);
  let cursor = CONTENT_LEFT;
  for (let i = 0; i < n; i++) {
    xs[i] = cursor;
    cursor += widths[i] + COL_GAP;
  }
  return xs;
}

/**
 * Draw a table: a bold caption line, a header row of column names, then one row
 * per data row. Each cell is drawn at its column's computed x.
 */
function drawTable(
  pdf: Doc,
  name: string,
  columns: string[],
  rows: string[][],
  startY: number,
): number {
  let y = startY;
  const xs = computeColumnXs(pdf, columns, rows);

  // Table caption — a sentinel the parser keys on to start a table block.
  pdf.font("Helvetica-Bold").fontSize(HEADING_SIZE);
  pdf.text(`[Table] ${name}`, CONTENT_LEFT, y, { lineBreak: false });
  y += LINE_H + 2;

  // Header row.
  y = drawRow(pdf, columns, xs, y, true);

  // Data rows.
  for (const row of rows) {
    y = ensureSpace(pdf, y, LINE_H);
    if (y === CONTENT_LEFT) {
      // We started a fresh page — repeat the header so geometry is consistent.
      y = drawRow(pdf, columns, xs, y, true);
    }
    y = drawRow(pdf, row, xs, y, false);
  }
  return y;
}

/** Draw a single row of cells at fixed column x-positions. Returns next y. */
function drawRow(
  pdf: Doc,
  cells: string[],
  xs: number[],
  startY: number,
  bold: boolean,
): number {
  pdf.font(bold ? "Helvetica-Bold" : "Helvetica").fontSize(BODY_SIZE);
  for (let i = 0; i < cells.length; i++) {
    const cell = cells[i];
    if (cell === undefined || cell === "") continue; // empty cells emit no item
    const x = xs[i] ?? CONTENT_LEFT;
    // No `width` constraint: a constrained width makes pdfkit wrap the cell into
    // multiple lines/items even with lineBreak:false, which breaks the row model.
    // We rely on column x-anchors (not visual containment) for round-trip safety.
    pdf.text(cell, x, startY, { lineBreak: false });
  }
  return startY + LINE_H;
}

/** If `needed` vertical space won't fit, start a new page and reset y to top. */
function ensureSpace(pdf: Doc, y: number, needed: number): number {
  if (y + needed > PAGE_BOTTOM) {
    pdf.addPage();
    return CONTENT_LEFT;
  }
  return y;
}

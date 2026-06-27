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
 * Branding (logo monogram, letterhead, brand-colour rules, tinted table headers
 * and summary band, three template variants) is purely VISUAL CHROME drawn
 * AROUND and BEHIND the positioned text. Coloured fills produce no text runs and
 * brand-colour text never changes the field/value/table-marker strings, so the
 * round-trip parser is unaffected: every field value still lands at FIELD_VALUE_X
 * and every cell still lands at its column anchor.
 *
 * This is the generate half of the round-trip self-test: parse(render(doc)) must
 * reproduce doc.fields and doc.tables exactly. Clauses are render-only prose.
 */
import PDFDocument from "pdfkit";
import type { DocModel } from "../types";
import { brandFor, type Brand } from "../brand";

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

/* ------------------------------------------------------------------ */
/* Branding chrome constants. All purely visual — none of these alter   */
/* the positioned label/value/cell text the parser reads.               */
/* ------------------------------------------------------------------ */

const LOGO_SIZE = 30; // monogram block edge length
const LOGO_RADIUS = 6;
const LETTERHEAD_GAP = 16; // breathing room below the letterhead rule

type Doc = PDFKit.PDFDocument;

export async function renderPdf(
  doc: DocModel,
  brand: Brand = brandFor(doc.vendorName),
): Promise<Uint8Array> {
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
      drawDocument(pdf, doc, brand);
      pdf.end();
    } catch (err) {
      reject(err as Error);
    }
  });
}

function drawDocument(pdf: Doc, doc: DocModel, brand: Brand): void {
  // Branded letterhead (logo monogram + vendor name + brand rule). Returns the
  // y at which the title/field block begins. The whole content block is simply
  // shifted DOWN by the letterhead height — a uniform translation the geometry-
  // recovering parser is invariant to.
  let y = drawLetterhead(pdf, doc, brand);

  // Title (bold). Kept as the first text row so the parser still reads it as the
  // document title.
  pdf.fillColor("black").font("Helvetica-Bold").fontSize(TITLE_SIZE);
  pdf.text(doc.title, CONTENT_LEFT, y, { width: CONTENT_WIDTH, lineBreak: true });
  // Thin brand-colour rule directly under the title separates the masthead from
  // the field block (template-0 / template-2 accent).
  y = pdf.y + 4;
  if (brand.template !== 1) {
    drawRule(pdf, CONTENT_LEFT, y, CONTENT_WIDTH, brand.hex, 1.2);
  }
  y += SECTION_GAP;

  // Field header block — each field as "Label:  value" with the value at a fixed x.
  y = drawFields(pdf, doc, brand, y);

  // Tables.
  for (const table of doc.tables) {
    y = ensureSpace(pdf, y, LINE_H * 3, brand);
    y += SECTION_GAP;
    y = drawTable(pdf, table.name, table.columns, table.rows, y, brand);
  }

  // Clauses (render-only prose, contracts only).
  if (doc.clauses.length) {
    y = ensureSpace(pdf, y, LINE_H * 3, brand);
    y += SECTION_GAP;
    // Sentinel: marks the end of all tables so the parser stops collecting
    // table rows before the free-prose clause section begins.
    pdf.fillColor(brand.hex).font("Helvetica-Bold").fontSize(HEADING_SIZE);
    pdf.text("[Clauses]", CONTENT_LEFT, y, { lineBreak: false });
    pdf.fillColor("black");
    y += LINE_H + 2;
    for (const clause of doc.clauses) {
      y = ensureSpace(pdf, y, LINE_H * 2, brand);
      pdf.fillColor(brand.hex).font("Helvetica-Bold").fontSize(HEADING_SIZE);
      pdf.text(clause.heading, CONTENT_LEFT, y, { width: CONTENT_WIDTH });
      pdf.fillColor("black");
      y = pdf.y + 2;
      pdf.font("Helvetica").fontSize(BODY_SIZE);
      pdf.text(clause.body, CONTENT_LEFT, y, { width: CONTENT_WIDTH, align: "left" });
      y = pdf.y + SECTION_GAP / 2;
    }
  }

  // Brand-coloured remittance/footer on the final page. The remittance TEXT is
  // only emitted when a "[Clauses]" sentinel precedes it: that sentinel is the
  // single boundary the parser uses to stop collecting table rows, so footer
  // text after it can never be mistaken for a trailing data row. Table-only
  // documents (no clauses) get the footer RULE only — a pure stroke that emits
  // no text run and so is invisible to the parser.
  drawFooter(pdf, doc, brand, doc.clauses.length > 0);
}

/* ------------------------------------------------------------------ */
/* Branding chrome                                                     */
/* ------------------------------------------------------------------ */

/**
 * Draw the letterhead and return the y at which the title block should start.
 *
 * Three template variants keyed off brand.template change only the PLACEMENT of
 * the chrome (logo block, vendor name, rules, optional side band) — never the
 * title/field/table text:
 *   0 = classic: centered logo + vendor name, full-width brand rule.
 *   1 = modern: left brand side-band + left-aligned logo/vendor lockup.
 *   2 = minimal: small logo + inline vendor name, thin top rule only.
 */
function drawLetterhead(pdf: Doc, doc: DocModel, brand: Brand): number {
  const top = CONTENT_LEFT; // 50
  const vendor = doc.vendorName || "Vendor";

  if (brand.template === 0) {
    // Classic centered masthead.
    const blockX = PAGE_W / 2 - LOGO_SIZE / 2;
    drawLogo(pdf, blockX, top, brand);
    const nameY = top + LOGO_SIZE + 6;
    pdf.fillColor(brand.hex).font("Helvetica-Bold").fontSize(15);
    pdf.text(vendor, CONTENT_LEFT, nameY, { width: CONTENT_WIDTH, align: "center", lineBreak: false });
    let y = nameY + 18;
    drawRule(pdf, CONTENT_LEFT, y, CONTENT_WIDTH, brand.hex, 2);
    pdf.fillColor("black");
    return y + LETTERHEAD_GAP;
  }

  if (brand.template === 1) {
    // Modern: a thin full-height brand side-band plus a left lockup.
    pdf.save();
    pdf.fillColor(brand.hex).rect(0, 0, 8, PAGE_H).fill();
    pdf.restore();
    drawLogo(pdf, CONTENT_LEFT, top, brand);
    const nameX = CONTENT_LEFT + LOGO_SIZE + 12;
    pdf.fillColor(brand.hex).font("Helvetica-Bold").fontSize(15);
    pdf.text(vendor, nameX, top + 3, {
      width: CONTENT_WIDTH - LOGO_SIZE - 12,
      align: "left",
      lineBreak: false,
    });
    pdf.fillColor(brand.tintHex).font("Helvetica").fontSize(8);
    pdf.text("DOCUMENT", nameX, top + 20, { lineBreak: false });
    let y = top + LOGO_SIZE + 6;
    drawRule(pdf, CONTENT_LEFT, y, CONTENT_WIDTH, brand.hex, 2);
    pdf.fillColor("black");
    return y + LETTERHEAD_GAP;
  }

  // template === 2 — minimal: thin top rule, small logo, inline vendor name.
  drawRule(pdf, CONTENT_LEFT, top, CONTENT_WIDTH, brand.hex, 3);
  const logoY = top + 8;
  drawLogo(pdf, CONTENT_LEFT, logoY, brand);
  pdf.fillColor(brand.hex).font("Helvetica-Bold").fontSize(13);
  pdf.text(vendor, CONTENT_LEFT + LOGO_SIZE + 10, logoY + 8, {
    width: CONTENT_WIDTH - LOGO_SIZE - 10,
    align: "left",
    lineBreak: false,
  });
  pdf.fillColor("black");
  return logoY + LOGO_SIZE + LETTERHEAD_GAP;
}

/** A rounded brand-colour block bearing the vendor monogram in white. */
function drawLogo(pdf: Doc, x: number, y: number, brand: Brand): void {
  pdf.save();
  pdf.roundedRect(x, y, LOGO_SIZE, LOGO_SIZE, LOGO_RADIUS).fill(brand.hex);
  pdf.fillColor("white").font("Helvetica-Bold").fontSize(13);
  // Vertically/horizontally centre the initials within the block.
  const initials = brand.initials || "•";
  const textW = pdf.widthOfString(initials);
  const textH = pdf.currentLineHeight();
  pdf.text(initials, x + (LOGO_SIZE - textW) / 2, y + (LOGO_SIZE - textH) / 2, {
    lineBreak: false,
  });
  pdf.restore();
}

/** A horizontal brand-colour rule (a fill, so it emits no text run). */
function drawRule(pdf: Doc, x: number, y: number, w: number, hex: string, weight: number): void {
  pdf.save();
  pdf.lineWidth(weight).strokeColor(hex).moveTo(x, y).lineTo(x + w, y).stroke();
  pdf.restore();
}

/** A tinted background band behind a block of rows (a fill, no text run). */
function drawBand(pdf: Doc, x: number, y: number, w: number, h: number, hex: string): void {
  pdf.save();
  pdf.fillColor(hex).rect(x, y, w, h).fill();
  pdf.restore();
}

/**
 * Brand-coloured remittance footer at the bottom of the current page. Always
 * draws a thin brand rule (a stroke — no text run). The remittance TEXT is only
 * drawn when `withText` is true (i.e. shielded by a "[Clauses]" sentinel), so it
 * can never be collected as a trailing table row.
 */
function drawFooter(pdf: Doc, doc: DocModel, brand: Brand, withText: boolean): void {
  const y = PAGE_H - 34;
  drawRule(pdf, CONTENT_LEFT, y, CONTENT_WIDTH, brand.tintHex, 0.8);
  if (!withText) {
    pdf.fillColor("black");
    return;
  }
  pdf.save();
  pdf.fillColor(brand.hex).font("Helvetica").fontSize(7.5);
  const vendor = doc.vendorName || "Vendor";
  pdf.text(`Remit to ${vendor}  •  Generated document`, CONTENT_LEFT, y + 4, {
    width: CONTENT_WIDTH,
    align: "center",
    lineBreak: false,
  });
  pdf.restore();
  pdf.fillColor("black");
}

/* ------------------------------------------------------------------ */
/* Fields                                                              */
/* ------------------------------------------------------------------ */

/** Draw the labelled field block. Returns the new y cursor. */
function drawFields(pdf: Doc, doc: DocModel, brand: Brand, startY: number): number {
  let y = startY;

  // Tinted summary band behind the field block (template 0/1). Pure fill: it
  // sits BEHIND the text and adds no runs, so the parser is unaffected. Drawn
  // first so the label/value text paints on top.
  if (brand.template !== 2 && doc.fields.length > 0) {
    const bandH = doc.fields.length * LINE_H + 8;
    if (y + bandH <= PAGE_BOTTOM) {
      drawBand(pdf, CONTENT_LEFT - 6, y - 4, CONTENT_WIDTH + 12, bandH, brand.tintHex);
    }
  }

  for (const field of doc.fields) {
    y = ensureSpace(pdf, y, LINE_H, brand);
    // Label drawn at the left anchor with a trailing colon (single unbroken run),
    // tinted in the brand colour for emphasis (text string unchanged).
    pdf.fillColor(brand.hex).font("Helvetica-Bold").fontSize(BODY_SIZE);
    pdf.text(`${field.label}:`, CONTENT_LEFT, y, { lineBreak: false });
    // Value drawn at the fixed value-x so the parser can recover it by column.
    if (field.value !== "") {
      pdf.fillColor("black").font("Helvetica").fontSize(BODY_SIZE);
      pdf.text(field.value, FIELD_VALUE_X, y, { lineBreak: false });
    }
    y += LINE_H;
  }
  pdf.fillColor("black");
  return y;
}

/* ------------------------------------------------------------------ */
/* Tables                                                              */
/* ------------------------------------------------------------------ */

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
 * per data row. Each cell is drawn at its column's computed x. The header row is
 * shaded with the brand tint and underlined with a brand-colour rule — both are
 * fills/strokes drawn behind the (unchanged) header text.
 */
function drawTable(
  pdf: Doc,
  name: string,
  columns: string[],
  rows: string[][],
  startY: number,
  brand: Brand,
): number {
  let y = startY;
  const xs = computeColumnXs(pdf, columns, rows);

  // Table caption — a sentinel the parser keys on to start a table block. Tinted
  // brand colour; string ("[Table] <name>") is unchanged.
  pdf.fillColor(brand.hex).font("Helvetica-Bold").fontSize(HEADING_SIZE);
  pdf.text(`[Table] ${name}`, CONTENT_LEFT, y, { lineBreak: false });
  pdf.fillColor("black");
  y += LINE_H + 2;

  // Header row — shade the band and underline it before drawing the header text.
  y = drawHeaderRow(pdf, columns, xs, y, brand);

  // Data rows.
  for (const row of rows) {
    y = ensureSpace(pdf, y, LINE_H, brand);
    if (y === CONTENT_LEFT) {
      // We started a fresh page — repeat the header so geometry is consistent.
      y = drawHeaderRow(pdf, columns, xs, y, brand);
    }
    y = drawRow(pdf, row, xs, y, false, brand);
  }
  return y;
}

/** Draw the shaded/underlined brand header row, then the header text. */
function drawHeaderRow(
  pdf: Doc,
  columns: string[],
  xs: number[],
  startY: number,
  brand: Brand,
): number {
  // Tint band behind the header (pure fill — no text run).
  drawBand(pdf, CONTENT_LEFT - 4, startY - 2, CONTENT_WIDTH + 8, LINE_H, brand.tintHex);
  const next = drawRow(pdf, columns, xs, startY, true, brand);
  // Brand-colour rule under the header row.
  drawRule(pdf, CONTENT_LEFT - 4, next - 3, CONTENT_WIDTH + 8, brand.hex, 1);
  return next;
}

/** Draw a single row of cells at fixed column x-positions. Returns next y. */
function drawRow(
  pdf: Doc,
  cells: string[],
  xs: number[],
  startY: number,
  bold: boolean,
  brand: Brand,
): number {
  // Header cells take the brand colour for emphasis; data cells stay black. The
  // cell text strings are unchanged either way.
  pdf.fillColor(bold ? brand.hex : "black").font(bold ? "Helvetica-Bold" : "Helvetica").fontSize(BODY_SIZE);
  for (let i = 0; i < cells.length; i++) {
    const cell = cells[i];
    if (cell === undefined || cell === "") continue; // empty cells emit no item
    const x = xs[i] ?? CONTENT_LEFT;
    // No `width` constraint: a constrained width makes pdfkit wrap the cell into
    // multiple lines/items even with lineBreak:false, which breaks the row model.
    // We rely on column x-anchors (not visual containment) for round-trip safety.
    pdf.text(cell, x, startY, { lineBreak: false });
  }
  pdf.fillColor("black");
  return startY + LINE_H;
}

/** If `needed` vertical space won't fit, start a new page and reset y to top. */
function ensureSpace(pdf: Doc, y: number, needed: number, brand: Brand): number {
  if (y + needed > PAGE_BOTTOM) {
    pdf.addPage();
    // Repaint the modern side-band on continuation pages so the chrome is
    // consistent (pure fill, well clear of the content's text rows).
    if (brand.template === 1) {
      pdf.save();
      pdf.fillColor(brand.hex).rect(0, 0, 8, PAGE_H).fill();
      pdf.restore();
      pdf.fillColor("black");
    }
    return CONTENT_LEFT;
  }
  return y;
}

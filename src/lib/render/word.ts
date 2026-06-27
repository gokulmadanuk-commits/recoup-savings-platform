/**
 * DocModel -> .docx (Word). Generated with `docx`; the layout is chosen so the
 * mammoth-based parser in ../parsing/word.ts can reconstruct fields and tables
 * losslessly (the round-trip gate).
 *
 * Layout:
 *   - A branded letterhead: a coloured monogram block, the vendor name in the
 *     brand colour, a thin brand rule, then the document title.
 *   - Hidden marker paragraphs ([[DOCTYPE: …]] / [[VENDOR: …]]) so docType and
 *     vendorName survive even when no field carries them.
 *   - Fields as "Label: value" paragraphs (split on the FIRST ": " on parse).
 *   - Each table as a real Word table: a [[TABLE: <name>]] caption paragraph
 *     immediately before it (so the parser recovers the table name), then a
 *     header row of columns followed by one row per data row. The header row is
 *     shaded with the brand tint and underlined with the brand colour.
 *   - Clauses as Heading2 + body paragraph (render-only; not parsed back).
 *
 * BRANDING IS PURELY VISUAL CHROME. Everything that carries data — the title
 * h1, the marker <p>s, the "Label: value" <p>s, the [[TABLE:]] caption, and the
 * table cells — keeps its exact text and structure. The letterhead/logo/footer
 * and section sub-labels are emitted as Heading2–6 paragraphs, which mammoth
 * maps to <h2>…<h6>; the parser only inspects <h1>/<p>/<table>, so this chrome
 * is invisible to it. Cell/run shading + borders are dropped by mammoth too, so
 * the round-trip is unaffected.
 */
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  Table,
  TableRow,
  TableCell,
  WidthType,
  BorderStyle,
  ShadingType,
  AlignmentType,
} from "docx";
import type { DocModel, DocTable } from "../types";
import { type Brand, brandFor } from "../brand";

export const DOCTYPE_MARKER = "[[DOCTYPE:";
export const VENDOR_MARKER = "[[VENDOR:";
export const TABLE_MARKER = "[[TABLE:";
export const FIELD_SEP = ": ";

/** Strip the leading "#" from a brand hex so docx gets a bare RRGGBB value. */
function hex6(hex: string): string {
  return hex.replace(/^#/, "").toUpperCase();
}

/**
 * Hidden marker paragraph. mammoth still emits the bracketed token as a plain
 * <p>, so the parser recovers it; `vanish` keeps it out of sight in Word, and
 * the "[[" prefix keeps it unambiguous against real field lines.
 */
function marker(prefix: string, value: string): Paragraph {
  return new Paragraph({
    children: [
      new TextRun({ text: `${prefix} ${value}]]`, vanish: true, size: 2 }),
    ],
  });
}

function fieldParagraph(label: string, value: string): Paragraph {
  return new Paragraph({ children: [new TextRun(`${label}${FIELD_SEP}${value}`)] });
}

/** A data cell — non-empty paragraph so mammoth always emits the <td>. */
function cell(text: string): TableCell {
  return new TableCell({
    children: [new Paragraph({ children: [new TextRun(text)] })],
  });
}

/**
 * A header cell: same text as the column name, but shaded with the brand tint,
 * underlined with a brand-colour bottom border, and its label in the brand
 * colour. mammoth drops the shading/border/colour, so the parser still reads
 * back the bare column name.
 */
function headerCell(text: string, brand: Brand): TableCell {
  return new TableCell({
    shading: { type: ShadingType.CLEAR, color: "auto", fill: hex6(brand.tintHex) },
    borders: {
      bottom: { style: BorderStyle.SINGLE, size: 12, color: hex6(brand.hex) },
    },
    children: [
      new Paragraph({
        children: [
          new TextRun({ text, bold: true, color: hex6(brand.hex) }),
        ],
      }),
    ],
  });
}

function renderTable(t: DocTable, brand: Brand): (Paragraph | Table)[] {
  const header = new TableRow({
    children: t.columns.map((c) => headerCell(c, brand)),
    tableHeader: true,
  });
  const dataRows = t.rows.map(
    (row) =>
      new TableRow({
        children: t.columns.map((_, i) => cell(row[i] ?? "")),
      }),
  );
  const table = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [header, ...dataRows],
  });
  return [marker(TABLE_MARKER, t.name), table];
}

/* --------------------------------------------------------------------- */
/* Branded letterhead chrome (all Heading2–6 → <h2>…<h6>, parser-ignored) */
/* --------------------------------------------------------------------- */

/** The monogram "logo": brand.initials in white on a brand-colour block. */
function logoBlock(brand: Brand, alignment: (typeof AlignmentType)[keyof typeof AlignmentType]): Paragraph {
  return new Paragraph({
    heading: HeadingLevel.HEADING_3,
    alignment,
    shading: { type: ShadingType.CLEAR, color: "auto", fill: hex6(brand.hex) },
    spacing: { after: 60 },
    children: [
      new TextRun({ text: ` ${brand.initials} `, bold: true, color: "FFFFFF", size: 30 }),
    ],
  });
}

/** Vendor name in the brand colour — the letterhead wordmark. */
function vendorWordmark(
  brand: Brand,
  vendorName: string,
  alignment: (typeof AlignmentType)[keyof typeof AlignmentType],
  border?: boolean,
): Paragraph {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2,
    alignment,
    spacing: { after: 40 },
    ...(border
      ? {
          border: {
            left: { style: BorderStyle.SINGLE, size: 24, space: 8, color: hex6(brand.hex) },
          },
        }
      : {}),
    children: [
      new TextRun({ text: vendorName, bold: true, color: hex6(brand.hex), size: 32 }),
    ],
  });
}

/** A thin brand-colour rule (an empty heading paragraph with a bottom border). */
function brandRule(brand: Brand): Paragraph {
  return new Paragraph({
    heading: HeadingLevel.HEADING_5,
    spacing: { before: 20, after: 120 },
    border: {
      bottom: { style: BorderStyle.SINGLE, size: 18, space: 1, color: hex6(brand.hex) },
    },
    children: [new TextRun({ text: "", size: 2 })],
  });
}

/** Build the letterhead block for the chosen template variant. */
function letterhead(brand: Brand, vendorName: string): Paragraph[] {
  switch (brand.template) {
    case 0:
      // Classic centered letterhead.
      return [
        logoBlock(brand, AlignmentType.CENTER),
        vendorWordmark(brand, vendorName, AlignmentType.CENTER),
        brandRule(brand),
      ];
    case 1:
      // Modern left band: logo + wordmark with a brand-colour sidebar accent.
      return [
        logoBlock(brand, AlignmentType.LEFT),
        vendorWordmark(brand, vendorName, AlignmentType.LEFT, true),
        brandRule(brand),
      ];
    case 2:
    default:
      // Minimal top-rule: a thin rule over a compact left wordmark + monogram.
      return [
        brandRule(brand),
        logoBlock(brand, AlignmentType.LEFT),
        vendorWordmark(brand, vendorName, AlignmentType.LEFT),
      ];
  }
}

/** A brand-coloured remittance/footer line (render-only chrome). */
function footerLine(brand: Brand, vendorName: string): Paragraph {
  return new Paragraph({
    heading: HeadingLevel.HEADING_6,
    alignment: AlignmentType.CENTER,
    spacing: { before: 200 },
    border: {
      top: { style: BorderStyle.SINGLE, size: 6, space: 6, color: hex6(brand.hex) },
    },
    children: [
      new TextRun({
        text: `${vendorName}  •  Remit payment per the terms above  •  Thank you for your business`,
        color: hex6(brand.hex),
        size: 16,
      }),
    ],
  });
}

export async function renderWord(
  doc: DocModel,
  brand: Brand = brandFor(doc.vendorName),
): Promise<Uint8Array> {
  const children: (Paragraph | Table)[] = [];

  // Branded letterhead (chrome only; Heading2–6, ignored by the parser).
  children.push(...letterhead(brand, doc.vendorName));

  // Document title — the first (and only) <h1>, so the parser reads it as title.
  children.push(
    new Paragraph({ text: doc.title, heading: HeadingLevel.HEADING_1 }),
  );

  // docType / vendorName markers — independent of which fields exist (hidden).
  children.push(marker(DOCTYPE_MARKER, doc.docType));
  children.push(marker(VENDOR_MARKER, doc.vendorName));

  for (const f of doc.fields) {
    children.push(fieldParagraph(f.label, f.value));
  }

  for (const t of doc.tables) {
    children.push(...renderTable(t, brand));
  }

  for (const c of doc.clauses) {
    // Clause heading in the brand colour (render-only Heading2).
    children.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_2,
        children: [
          new TextRun({ text: c.heading, bold: true, color: hex6(brand.hex) }),
        ],
      }),
    );
    children.push(new Paragraph({ children: [new TextRun(c.body)] }));
  }

  // Branded footer / remittance line.
  children.push(footerLine(brand, doc.vendorName));

  const document = new Document({ sections: [{ children }] });
  const buffer = await Packer.toBuffer(document);
  return new Uint8Array(buffer);
}

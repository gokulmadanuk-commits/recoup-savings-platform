/**
 * DocModel -> .docx (Word). Generated with `docx`; the layout is chosen so the
 * mammoth-based parser in ../parsing/word.ts can reconstruct fields and tables
 * losslessly (the round-trip gate).
 *
 * Layout:
 *   - Title as Heading1.
 *   - Hidden marker paragraphs ([[DOCTYPE: …]] / [[VENDOR: …]]) so docType and
 *     vendorName survive even when no field carries them.
 *   - Fields as "Label: value" paragraphs (split on the FIRST ": " on parse).
 *   - Each table as a real Word table: a [[TABLE: <name>]] caption paragraph
 *     immediately before it (so the parser recovers the table name), then a
 *     header row of columns followed by one row per data row.
 *   - Clauses as Heading2 + body paragraph (render-only; not parsed back).
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
} from "docx";
import type { DocModel, DocTable } from "../types";

export const DOCTYPE_MARKER = "[[DOCTYPE:";
export const VENDOR_MARKER = "[[VENDOR:";
export const TABLE_MARKER = "[[TABLE:";
export const FIELD_SEP = ": ";

function marker(prefix: string, value: string): Paragraph {
  // A plain paragraph mammoth emits as <p>…</p>; the bracketed token keeps it
  // unambiguous against real field lines (which never start with "[[").
  return new Paragraph({ children: [new TextRun(`${prefix} ${value}]]`)] });
}

function fieldParagraph(label: string, value: string): Paragraph {
  return new Paragraph({ children: [new TextRun(`${label}${FIELD_SEP}${value}`)] });
}

function cell(text: string): TableCell {
  // A non-empty paragraph per cell. Empty strings render as an empty paragraph;
  // mammoth still emits the <td>, so the parser reads an empty cell back.
  return new TableCell({
    children: [new Paragraph({ children: [new TextRun(text)] })],
  });
}

function renderTable(t: DocTable): (Paragraph | Table)[] {
  const header = new TableRow({
    children: t.columns.map((c) => cell(c)),
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

export async function renderWord(doc: DocModel): Promise<Uint8Array> {
  const children: (Paragraph | Table)[] = [];

  children.push(
    new Paragraph({ text: doc.title, heading: HeadingLevel.HEADING_1 }),
  );

  // docType / vendorName markers — independent of which fields exist.
  children.push(marker(DOCTYPE_MARKER, doc.docType));
  children.push(marker(VENDOR_MARKER, doc.vendorName));

  for (const f of doc.fields) {
    children.push(fieldParagraph(f.label, f.value));
  }

  for (const t of doc.tables) {
    children.push(...renderTable(t));
  }

  for (const c of doc.clauses) {
    children.push(
      new Paragraph({ text: c.heading, heading: HeadingLevel.HEADING_2 }),
    );
    children.push(new Paragraph({ children: [new TextRun(c.body)] }));
  }

  const document = new Document({ sections: [{ children }] });
  const buffer = await Packer.toBuffer(document);
  return new Uint8Array(buffer);
}

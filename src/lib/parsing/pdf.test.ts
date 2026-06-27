/**
 * PDF round-trip self-test: render(doc) -> parse -> the parsed fields and tables
 * must deep-equal the source DocModel's (cells trimmed), and vendorName + docType
 * must match. Exercised against realistic Brightseat / CollabHub DocModels plus a
 * synthetic edge case (empty cells, a comma value, a 12-row table).
 */
import { describe, it, expect } from "vitest";
import type { DocModel, DocTable } from "../types";
import { vendorRecordToDocModels } from "../docmodel/to-docmodel";
import brightseatSeed from "../seed/vendors/brightseat";
import collabhubSeed from "../seed/vendors/collabhub";
import { renderPdf } from "../render/pdf";
import { parsePdf } from "./pdf";

/** Cell-trimmed copy of a table (the round-trip allows trimming each cell). */
function trimTable(t: DocTable): DocTable {
  return {
    name: t.name,
    columns: t.columns.map((c) => c.trim()),
    rows: t.rows.map((r) => r.map((c) => c.trim())),
  };
}

function trimFields(doc: DocModel) {
  return doc.fields.map((f) => ({ label: f.label.trim(), value: f.value.trim() }));
}

async function roundTrip(doc: DocModel) {
  const bytes = await renderPdf(doc);
  expect(bytes.byteLength).toBeGreaterThan(0);
  return parsePdf(bytes, doc.fileName);
}

function assertRoundTrip(doc: DocModel) {
  return async () => {
    const parsed = await roundTrip(doc);

    expect(parsed.parseStatus).not.toBe("failed");
    expect(parsed.fileName).toBe(doc.fileName);
    expect(parsed.format).toBe("pdf");
    expect(parsed.docType).toBe(doc.docType);
    expect(parsed.vendorName).toBe(doc.vendorName);

    expect(parsed.fields).toEqual(trimFields(doc));
    expect(parsed.tables).toEqual(doc.tables.map(trimTable));
  };
}

const brightseatDocs = vendorRecordToDocModels(brightseatSeed.record);
const collabhubDocs = vendorRecordToDocModels(collabhubSeed.record);

const contractDoc = brightseatDocs.find((d) => d.docType === "contract")!;
const invoiceDocs = brightseatDocs.filter((d) => d.docType === "invoice");
const usageDoc = collabhubDocs.find((d) => d.docType === "usage_export")!;

describe("PDF round-trip", () => {
  it("has the expected source docs", () => {
    expect(contractDoc).toBeTruthy();
    expect(invoiceDocs.length).toBeGreaterThanOrEqual(2);
    expect(usageDoc).toBeTruthy();
    // Sanity: the contract carries a Rate Card table + clauses.
    expect(contractDoc.tables.some((t) => t.name === "Rate Card")).toBe(true);
    expect(contractDoc.clauses.length).toBeGreaterThan(0);
    // The invoice carries the 10-column Line Items table.
    expect(invoiceDocs[0].tables[0].columns).toHaveLength(10);
  });

  it("round-trips the Brightseat contract (Rate Card + clauses)", assertRoundTrip(contractDoc));

  it("round-trips Brightseat invoice #1", assertRoundTrip(invoiceDocs[0]));
  it("round-trips Brightseat invoice #2", assertRoundTrip(invoiceDocs[1]));

  it("round-trips the CollabHub usage export", async () => {
    // usage docs are authored as 'excel' format by to-docmodel; render it as a
    // PDF and confirm the fields/tables survive regardless of source format.
    await assertRoundTrip(usageDoc)();
  });

  it(
    "round-trips a synthetic edge case (empty cells, comma value, 12-row table)",
    assertRoundTrip(edgeCaseDoc()),
  );
});

/** Synthetic DocModel: empty cells, a "$1,250.00" comma value, a 12-row table. */
function edgeCaseDoc(): DocModel {
  const rows: string[][] = [];
  for (let i = 1; i <= 12; i++) {
    rows.push([
      `Line item ${i}`,
      i % 3 === 0 ? "" : `SKU-${i}`, // some empty SKU cells
      "each",
      String(i),
      i % 2 === 0 ? "$1,250.00" : "$999.99", // comma value
      i % 4 === 0 ? "" : `$${i}50.00`, // some empty amount cells
    ]);
  }
  return {
    docType: "invoice",
    format: "pdf",
    vendorName: "Edge Case Co.",
    title: "Invoice EDGE-0001 — Edge Case Co.",
    fields: [
      { label: "Invoice Number", value: "EDGE-0001" },
      { label: "Vendor", value: "Edge Case Co." },
      { label: "PO Number", value: "" }, // empty field value
      { label: "Total", value: "$1,250.00" }, // comma value in a field
    ],
    tables: [
      {
        name: "Line Items",
        columns: ["Description", "SKU", "UoM", "Qty", "Unit Price", "Amount"],
        rows,
      },
    ],
    clauses: [],
    fileName: "edge-case-invoice.pdf",
  };
}

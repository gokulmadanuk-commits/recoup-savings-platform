import { describe, it, expect } from "vitest";
import { DocModelSchema, type DocModel } from "../types";
import { vendorRecordToDocModels } from "../docmodel/to-docmodel";
import { renderWord } from "../render/word";
import { parseWord } from "./word";
import brightseatSeed from "../seed/vendors/brightseat";
import collabhubSeed from "../seed/vendors/collabhub";

/** Trim each table cell + column header (trimming is allowed by the contract). */
function trimTable(t: DocModel["tables"][number]) {
  return {
    name: t.name,
    columns: t.columns.map((c) => c.trim()),
    rows: t.rows.map((r) => r.map((c) => c.trim())),
  };
}
function trimFields(fields: DocModel["fields"]) {
  return fields.map((f) => ({ label: f.label, value: f.value.trim() }));
}

/** Render -> parse and assert the round-trip gate for one DocModel. */
async function expectRoundTrip(doc: DocModel) {
  const bytes = await renderWord(doc);
  const parsed = await parseWord(bytes, doc.fileName);

  expect(parsed.docType).toBe(doc.docType);
  expect(parsed.vendorName).toBe(doc.vendorName);
  expect(trimFields(parsed.fields)).toEqual(trimFields(doc.fields));
  expect(parsed.tables.map(trimTable)).toEqual(doc.tables.map(trimTable));
}

const brightseatDocs = vendorRecordToDocModels(brightseatSeed.record);
const collabhubDocs = vendorRecordToDocModels(collabhubSeed.record);

const contractDoc = brightseatDocs.find((d) => d.docType === "contract")!;
const invoiceDocs = brightseatDocs.filter((d) => d.docType === "invoice").slice(0, 3);
const usageDoc = collabhubDocs.find((d) => d.docType === "usage_export")!;

/** Synthetic edge case: empty cells, a comma in a value, and a 12-row table. */
const edgeCaseDoc: DocModel = DocModelSchema.parse({
  docType: "invoice",
  format: "word",
  vendorName: "Edge Case Vendor, LLC",
  title: "Invoice EDGE-001 — Edge Case Vendor, LLC",
  fields: [
    { label: "Invoice Number", value: "EDGE-001" },
    { label: "Vendor", value: "Edge Case Vendor, LLC" },
    { label: "Invoice Date", value: "2026-06-01" },
    { label: "PO Number", value: "" }, // empty value
    { label: "Subtotal", value: "$1,250.00" }, // value containing a comma
    { label: "Total", value: "$1,250.00" },
  ],
  tables: [
    {
      name: "Line Items",
      columns: [
        "Description",
        "SKU",
        "UoM",
        "Qty",
        "Unit Price",
        "Amount",
        "Type",
        "Asset ID",
        "Service Date",
        "Labor Type",
      ],
      // 12 rows; mix of empty cells and a comma-bearing value.
      rows: Array.from({ length: 12 }, (_, i) => [
        `Line item ${i + 1}`,
        i % 2 === 0 ? `SKU-${i + 1}` : "", // empty cell on odd rows
        "each",
        "1",
        i === 0 ? "$1,250.00" : "$10.00", // comma value
        i === 0 ? "$1,250.00" : "$10.00",
        "other",
        "", // empty cell
        "", // empty cell
        "", // empty cell
      ]),
    },
  ],
  clauses: [],
  fileName: "edge-case-invoice.docx",
});

describe("Word render -> parse round-trip", () => {
  it("round-trips the Brightseat contract (Rate Card table + clauses)", async () => {
    await expectRoundTrip(contractDoc);
  });

  it("round-trips Brightseat invoices (10-column Line Items table)", async () => {
    expect(invoiceDocs.length).toBeGreaterThanOrEqual(2);
    for (const inv of invoiceDocs) {
      await expectRoundTrip(inv);
    }
  });

  it("round-trips the CollabHub usage export (Usage Records table)", async () => {
    expect(usageDoc.tables[0].rows.length).toBeGreaterThan(0);
    await expectRoundTrip(usageDoc);
  });

  it("round-trips a synthetic doc with empty cells, a comma value, and a 12-row table", async () => {
    expect(edgeCaseDoc.tables[0].rows).toHaveLength(12);
    await expectRoundTrip(edgeCaseDoc);
  });

  it("detects docType and vendorName from the markers", async () => {
    const bytes = await renderWord(contractDoc);
    const parsed = await parseWord(bytes, contractDoc.fileName);
    expect(parsed.docType).toBe("contract");
    expect(parsed.vendorName).toBe("Brightseat CRM");
    expect(parsed.parseStatus).toBe("ok");
    expect(parsed.format).toBe("word");
  });
});

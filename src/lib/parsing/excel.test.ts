import { describe, it, expect } from "vitest";
import type { DocModel, DocField, DocTable } from "../types";
import { vendorRecordToDocModels } from "../docmodel/to-docmodel";
import { renderExcel } from "../render/excel";
import { parseExcel } from "./excel";
import brightseatSeed from "../seed/vendors/brightseat";
import collabhubSeed from "../seed/vendors/collabhub";

/** Trim every cell exactly as the round-trip contract permits. */
function normalizeTables(tables: DocTable[]): DocTable[] {
  return tables.map((t) => ({
    name: t.name,
    columns: t.columns.map((c) => c.trim()),
    rows: t.rows.map((r) => r.map((cell) => cell.trim())),
  }));
}
function normalizeFields(fields: DocField[]): DocField[] {
  return fields.map((f) => ({ label: f.label.trim(), value: f.value.trim() }));
}

async function roundTrip(doc: DocModel) {
  const buf = await renderExcel(doc);
  return parseExcel(buf, doc.fileName);
}

function assertRoundTrip(doc: DocModel, parsed: Awaited<ReturnType<typeof parseExcel>>) {
  expect(parsed.fields).toEqual(normalizeFields(doc.fields));
  expect(parsed.tables).toEqual(normalizeTables(doc.tables));
  expect(parsed.vendorName).toBe(doc.vendorName);
  expect(parsed.docType).toBe(doc.docType);
  expect(parsed.format).toBe("excel");
}

describe("Excel render -> parse round-trip", () => {
  const brightseatDocs = vendorRecordToDocModels(brightseatSeed.record);
  const collabhubDocs = vendorRecordToDocModels(collabhubSeed.record);

  it("round-trips the Brightseat contract (Rate Card table + clauses)", async () => {
    const contract = brightseatDocs.find((d) => d.docType === "contract");
    expect(contract).toBeTruthy();
    expect(contract!.tables.find((t) => t.name === "Rate Card")).toBeTruthy();
    expect(contract!.clauses.length).toBeGreaterThan(0);
    const parsed = await roundTrip(contract!);
    assertRoundTrip(contract!, parsed);
    expect(parsed.docType).toBe("contract");
  });

  it("round-trips at least two Brightseat invoices (10-column Line Items)", async () => {
    const invoices = brightseatDocs.filter((d) => d.docType === "invoice");
    expect(invoices.length).toBeGreaterThanOrEqual(2);
    for (const inv of invoices.slice(0, 3)) {
      const lineItems = inv.tables.find((t) => t.name === "Line Items");
      expect(lineItems).toBeTruthy();
      expect(lineItems!.columns).toHaveLength(10);
      const parsed = await roundTrip(inv);
      assertRoundTrip(inv, parsed);
      expect(parsed.docType).toBe("invoice");
    }
  });

  it("round-trips the CollabHub usage export (Usage Records)", async () => {
    const usage = collabhubDocs.find((d) => d.docType === "usage_export");
    expect(usage).toBeTruthy();
    const records = usage!.tables.find((t) => t.name === "Usage Records");
    expect(records).toBeTruthy();
    expect(records!.rows.length).toBeGreaterThan(0);
    const parsed = await roundTrip(usage!);
    assertRoundTrip(usage!, parsed);
    expect(parsed.docType).toBe("usage_export");
  });

  it("round-trips a synthetic edge case (empty cells, comma value, 12-row table)", async () => {
    const rows: string[][] = [];
    for (let i = 1; i <= 12; i += 1) {
      rows.push([
        `SKU-${i}`,
        i === 4 ? "" : `Item number ${i}`, // an empty middle cell
        i % 2 === 0 ? "$1,250.00" : "", // comma value + empty cells
        i === 12 ? "" : `${i}`, // trailing empty on the last row
      ]);
    }
    const doc: DocModel = {
      docType: "invoice",
      format: "excel",
      vendorName: "Edgecase Vendor, LLC",
      title: "Edge Case — Synthetic",
      fields: [
        { label: "Invoice Number", value: "EC-2026-0001" },
        { label: "Vendor", value: "Edgecase Vendor, LLC" },
        { label: "Note", value: "" }, // empty field value
        { label: "Total", value: "$1,250.00" }, // comma value
      ],
      tables: [
        {
          name: "Line Items",
          columns: ["SKU", "Description", "Amount", "Qty"],
          rows,
        },
      ],
      clauses: [],
      fileName: "edgecase-synthetic.xlsx",
    };
    const parsed = await roundTrip(doc);
    assertRoundTrip(doc, parsed);
    expect(parsed.tables[0].rows).toHaveLength(12);
    // empty middle cell preserved
    expect(parsed.tables[0].rows[3][1]).toBe("");
    // comma value preserved verbatim
    expect(parsed.tables[0].rows[1][2]).toBe("$1,250.00");
    // trailing empty cell on the last row preserved
    expect(parsed.tables[0].rows[11][3]).toBe("");
    // empty field value preserved
    expect(parsed.fields.find((f) => f.label === "Note")!.value).toBe("");
  });
});

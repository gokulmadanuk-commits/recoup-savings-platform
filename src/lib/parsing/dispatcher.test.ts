import { describe, it, expect } from "vitest";
import { parseFile, parseBatch, extensionOf } from "./index";
import { renderPdf } from "../render/pdf";
import { renderExcel } from "../render/excel";
import { DocModelSchema, type DocModel } from "../types";

function sampleInvoice(): DocModel {
  return DocModelSchema.parse({
    docType: "invoice",
    format: "pdf",
    vendorName: "Brightseat CRM",
    title: "Invoice BS-INV-01 — Brightseat CRM",
    fields: [
      { label: "Invoice Number", value: "BS-INV-01" },
      { label: "Vendor", value: "Brightseat CRM" },
      { label: "Invoice Date", value: "2025-08-05" },
      { label: "Total", value: "$9,720.00" },
    ],
    tables: [
      {
        name: "Line Items",
        columns: ["Description", "SKU", "UoM", "Qty", "Unit Price", "Amount", "Type", "Asset ID", "Service Date", "Labor Type"],
        rows: [
          ["Professional Seat License", "CRM-SEAT", "seat", "200", "$48.60", "$9,720.00", "seat", "", "", ""],
        ],
      },
    ],
    clauses: [],
    fileName: "brightseat-invoice.pdf",
  });
}

describe("parsing dispatcher", () => {
  it("routes by extension", () => {
    expect(extensionOf("a/b/c.PDF")).toBe("pdf");
    expect(extensionOf("x.xlsx")).toBe("xlsx");
    expect(extensionOf("noext")).toBe("");
  });

  it("parses a rendered PDF via the dispatcher", async () => {
    const doc = sampleInvoice();
    const data = await renderPdf(doc);
    const parsed = await parseFile({ fileName: "brightseat-invoice.pdf", data });
    expect(parsed.parseStatus).not.toBe("failed");
    expect(parsed.docType).toBe("invoice");
    expect(parsed.tables[0].rows[0]).toEqual(doc.tables[0].rows[0]);
  });

  it("returns a 'failed' doc for a corrupt file instead of throwing", async () => {
    const garbage = new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    const parsed = await parseFile({ fileName: "broken.pdf", data: garbage });
    expect(parsed.parseStatus).toBe("failed");
    expect(parsed.warnings.length).toBeGreaterThan(0);
  });

  it("a single bad file never aborts the batch", async () => {
    const pdf = await renderPdf(sampleInvoice());
    const xlsx = await renderExcel(sampleInvoice());
    const result = await parseBatch([
      { fileName: "good.pdf", data: pdf },
      { fileName: "good.xlsx", data: xlsx },
      { fileName: "broken.pdf", data: new Uint8Array([1, 2, 3]) },
      { fileName: "mystery.bin", data: new Uint8Array([9, 9, 9]) },
    ]);
    expect(result.processed).toBe(4);
    expect(result.succeeded).toBe(2);
    expect(result.failed).toBe(2);
    expect(result.documents.every((d) => d.parseStatus !== "failed")).toBe(true);
  });
});

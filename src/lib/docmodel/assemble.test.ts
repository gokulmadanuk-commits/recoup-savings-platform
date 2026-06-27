import { describe, it, expect } from "vitest";
import { DocModelSchema, type DocModel } from "../types";
import { assembleDataset, type AssemblyFailure } from "./from-docmodel";

function doc(partial: Partial<DocModel> & Pick<DocModel, "docType" | "vendorName" | "fileName">): DocModel {
  return DocModelSchema.parse({ format: "pdf", title: "x", fields: [], tables: [], clauses: [], ...partial });
}

const goodInvoice = doc({
  docType: "invoice",
  vendorName: "Acme",
  fileName: "acme-inv.pdf",
  fields: [
    { label: "Invoice Number", value: "INV-1" },
    { label: "Vendor", value: "Acme" },
    { label: "Invoice Date", value: "2026-01-05" },
    { label: "Subtotal", value: "$100.00" },
    { label: "Total", value: "$100.00" },
  ],
  tables: [
    {
      name: "Line Items",
      columns: ["Description", "SKU", "UoM", "Qty", "Unit Price", "Amount", "Type", "Asset ID", "Service Date", "Labor Type"],
      rows: [["Widget", "W1", "each", "1", "$100.00", "$100.00", "recurring", "", "", ""]],
    },
  ],
});

// Contract doc missing the required End Date field -> docModelToContract throws.
const badContract = doc({
  docType: "contract",
  vendorName: "Acme",
  fileName: "acme-contract.pdf",
  fields: [{ label: "Vendor", value: "Acme" }],
});

const blankVendor = doc({ docType: "invoice", vendorName: "  ", fileName: "blank.pdf" });

describe("assembleDataset resilience", () => {
  it("skips a malformed document and reports it instead of aborting the batch", () => {
    const failures: AssemblyFailure[] = [];
    const ds = assembleDataset([goodInvoice, badContract, blankVendor], "Customer", "2026-06-27", failures);
    expect(ds.vendors).toHaveLength(1); // Acme survives via the good invoice
    expect(ds.vendors[0].contract).toBeNull(); // bad contract skipped
    expect(ds.vendors[0].invoices).toHaveLength(1);
    expect(failures.map((f) => f.fileName).sort()).toEqual(["acme-contract.pdf", "blank.pdf"]);
  });

  it("does not collapse blank-vendor documents into a synthetic vendor", () => {
    const failures: AssemblyFailure[] = [];
    const ds = assembleDataset([blankVendor, doc({ docType: "contract", vendorName: "Unknown", fileName: "u.pdf" })], "C", "2026-06-27", failures);
    expect(ds.vendors).toHaveLength(0);
    expect(failures).toHaveLength(2);
  });
});

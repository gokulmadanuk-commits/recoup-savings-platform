import { describe, it, expect } from "vitest";
import { VendorRecordSchema, type VendorRecord } from "../types";
import { toCents } from "../money";
import { vendorRecordToDocModels } from "./to-docmodel";
import { assembleDataset } from "./from-docmodel";

const CUSTOMER = "Northwind Logistics Group, Inc.";

function fixture(): VendorRecord {
  return VendorRecordSchema.parse({
    vendor: {
      id: "brightseat-crm",
      name: "Brightseat CRM",
      category: "SaaS (per-seat)",
      aliases: [],
    },
    contract: {
      id: "MSA-BRIGHTSEAT-2025",
      vendorId: "brightseat-crm",
      vendorName: "Brightseat CRM",
      category: "SaaS (per-seat)",
      sourceDoc: "brightseat-crm-contract.pdf",
      customer: CUSTOMER,
      effectiveDate: "2025-08-01",
      endDate: "2026-07-31",
      initialTermMonths: 12,
      autoRenew: true,
      noticeWindowDays: 30,
      noticeMethod: "written notice by email",
      renewalTermMonths: 12,
      earlyTermFeeCents: 0,
      governingLaw: "Delaware",
      currentAnnualValueCents: toCents(108_000),
      payment: { netDays: 30, discountPct: 0.02, discountDays: 10 },
      escalator: { type: "fixed", fixedPct: 0.05, capPct: 0.05, anniversaryMonth: 8 },
      commitment: {
        measurementPeriod: "annual",
        contractedSeats: 200,
        tier: "Professional",
        tierPricePerSeatCents: toCents(45),
      },
      rateCard: [
        {
          sku: "CRM-SEAT",
          description: "Professional Seat License",
          uom: "seat",
          unitPriceCents: toCents(45),
          effectiveFrom: "2025-08-01",
          effectiveTo: "2026-07-31",
        },
      ],
      capabilityTags: ["CRM", "Sales Automation"],
      signatory: { name: "Dana Okafor", title: "VP Finance", date: "2025-07-15" },
    },
    invoices: [
      {
        id: "BS-2025-0801",
        vendorId: "brightseat-crm",
        vendorName: "Brightseat CRM",
        sourceDoc: "brightseat-crm-invoice-2025-08.pdf",
        invoiceNumber: "BS-2025-0801",
        invoiceDate: "2025-08-05",
        dueDate: "2025-09-04",
        poNumber: "PO-NW-1042",
        billingPeriodStart: "2025-08-01",
        billingPeriodEnd: "2025-08-31",
        billTo: "Northwind Logistics Group, Inc. — Accounts Payable",
        remitTo: "Brightseat CRM Inc.",
        ein: "84-1029384",
        paymentTerms: { netDays: 30, discountPct: 0.02, discountDays: 10 },
        actualPayDate: "2025-09-05",
        subtotalCents: toCents(10_220),
        taxCents: 0,
        totalCents: toCents(10_220),
        lines: [
          {
            description: "Professional Seat License",
            sku: "CRM-SEAT",
            uom: "seat",
            qty: 200,
            unitPriceCents: toCents(48.6),
            lineTotalCents: toCents(9_720),
            lineType: "seat",
          },
          {
            description: "Premium Support",
            sku: "SUP",
            uom: "flat",
            qty: 1,
            unitPriceCents: toCents(500),
            lineTotalCents: toCents(500),
            lineType: "fee",
          },
        ],
      },
      {
        id: "BS-2025-0901",
        vendorId: "brightseat-crm",
        vendorName: "Brightseat CRM",
        sourceDoc: "brightseat-crm-invoice-2025-09.pdf",
        invoiceNumber: "BS-2025-0901",
        invoiceDate: "2025-09-05",
        subtotalCents: toCents(1_200),
        totalCents: toCents(1_200),
        lines: [
          {
            description: "Data Migration Services",
            uom: "each",
            qty: 1,
            unitPriceCents: toCents(1_200),
            lineTotalCents: toCents(1_200),
            lineType: "other",
            assetId: "MIG-001",
            serviceDate: "2025-09-10",
          },
        ],
      },
    ],
    usage: [
      {
        vendorId: "brightseat-crm",
        kind: "seat",
        identifier: "a.rivera@northwind.com",
        status: "active",
        lastActiveDate: "2026-06-20",
        provisioned: true,
      },
      {
        vendorId: "brightseat-crm",
        kind: "seat",
        identifier: "b.chen@northwind.com",
        status: "inactive",
        lastActiveDate: "2026-01-10",
        provisioned: true,
      },
      {
        vendorId: "brightseat-crm",
        kind: "seat",
        identifier: "c.idris@northwind.com",
        status: "never_used",
        lastActiveDate: null,
        provisioned: true,
      },
    ],
  });
}

describe("canonical <-> DocModel layout contract", () => {
  it("round-trips a full vendor record losslessly", () => {
    const vr = fixture();
    const docs = vendorRecordToDocModels(vr);
    const dataset = assembleDataset(docs, CUSTOMER, "2026-06-27");
    expect(dataset.vendors).toHaveLength(1);
    expect(dataset.vendors[0]).toEqual(vr);
  });

  it("emits the expected document set (1 contract + 2 invoices + 1 usage export)", () => {
    const docs = vendorRecordToDocModels(fixture());
    expect(docs.filter((d) => d.docType === "contract")).toHaveLength(1);
    expect(docs.filter((d) => d.docType === "invoice")).toHaveLength(2);
    expect(docs.filter((d) => d.docType === "usage_export")).toHaveLength(1);
  });

  it("exposes the rate card and line items as real tables", () => {
    const docs = vendorRecordToDocModels(fixture());
    const contract = docs.find((d) => d.docType === "contract")!;
    expect(contract.tables.find((t) => t.name === "Rate Card")).toBeTruthy();
    const invoice = docs.find((d) => d.docType === "invoice")!;
    const lines = invoice.tables.find((t) => t.name === "Line Items")!;
    expect(lines.rows.length).toBe(2);
    expect(lines.columns).toContain("Unit Price");
  });
});

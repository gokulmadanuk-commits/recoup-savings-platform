import { describe, it, expect } from "vitest";
import { CustomerRecordSchema, SELLER_NAME, type CustomerRecord } from "../types";
import { toCents } from "../../money";
import { customerRecordToDocModels } from "./to-docmodel";
import { assembleRevenueDataset } from "./from-docmodel";
import { RF } from "./labels";

const ANALYSIS_DATE = "2026-06-27";
const SEGMENT = "Retail distribution";

/** A CustomerRecord that populates EVERY field, to prove a lossless round-trip. */
function fixture(): CustomerRecord {
  return CustomerRecordSchema.parse({
    customer: {
      id: "atlas-grocers-holdings-llc",
      name: "Atlas Grocers Holdings, LLC",
      segment: SEGMENT,
      aliases: ["Atlas Grocers", "Atlas Grocers Hldgs."],
    },
    contract: {
      id: "MSA-ATLAS-GROCERS",
      customerId: "atlas-grocers-holdings-llc",
      customerName: "Atlas Grocers Holdings, LLC",
      segment: SEGMENT,
      sourceDoc: "atlas-grocers-contract.pdf",
      seller: SELLER_NAME,
      effectiveDate: "2022-03-01",
      endDate: "2027-02-28",
      initialTermMonths: 24,
      autoRenew: true,
      noticeWindowDays: 60,
      noticeMethod: "written notice by certified mail",
      renewalTermMonths: 12,
      governingLaw: "Ohio",
      auditWindowMonths: 36,
      currentAnnualValueCents: toCents(960_000),
      payment: { netDays: 45, discountPct: 0.02, discountDays: 10 },
      escalator: {
        type: "rpi_plus",
        fixedPct: 0.03,
        indexPlusPct: 0.01,
        capPct: 0.05,
        floorPct: 0.02,
        anniversaryMonth: 3,
        baseIndexYear: 2022,
        compounding: true,
      },
      introDiscount: {
        pct: 0.15,
        expiryDate: "2023-02-28",
        appliesToSku: "3PL-FEE",
      },
      surcharges: [
        {
          kind: "fuel",
          label: "Fuel Surcharge",
          basis: "EIA on-highway diesel, monthly",
          ratePct: 0.085,
          perUnitCents: null,
        },
        {
          kind: "other",
          label: "Pallet Handling",
          basis: "per pallet moved",
          ratePct: null,
          perUnitCents: toCents(3.5),
        },
      ],
      latePaymentInterestPct: 0.015,
      priceIncreaseSchedule: [
        {
          effectiveDate: "2025-03-01",
          newUnitPriceCents: toCents(42_000),
          sku: "3PL-FEE",
          note: "Annual list-price step",
        },
      ],
      commitment: {
        minCommitSpendCents: toCents(900_000),
        minCommitQty: 1000,
        measurementPeriod: "annual",
        includedAllowance: 500,
        overageUnitPriceCents: toCents(85),
        contractedSeats: null,
        tier: "Enterprise",
        tierPricePerSeatCents: null,
      },
      rateCard: [
        {
          sku: "3PL-FEE",
          description: "3PL distribution & fulfillment — monthly service fee",
          uom: "month",
          unitPriceCents: toCents(40_000),
          currency: "USD",
          effectiveFrom: "2022-03-01",
          effectiveTo: "2027-02-28",
          tierMin: null,
          tierMax: null,
          tierBaseFeeCents: null,
        },
        {
          sku: "PICK-PACK",
          description: "Pick & pack — per order",
          uom: "order",
          unitPriceCents: toCents(2.75),
          currency: "USD",
          effectiveFrom: null,
          effectiveTo: null,
          tierMin: 0,
          tierMax: 10_000,
          tierBaseFeeCents: toCents(1_500),
        },
      ],
      tiers: [
        {
          tierMin: 0,
          tierMax: 10_000,
          baseFeeCents: toCents(1_500),
          unitPriceCents: toCents(2.75),
          overageRateCents: toCents(2.25),
        },
        {
          tierMin: 10_000,
          tierMax: null,
          baseFeeCents: toCents(0),
          unitPriceCents: toCents(2.25),
          overageRateCents: null,
        },
      ],
      signatory: { name: "Maria Whitfield", title: "VP Operations", date: "2022-02-10" },
    },
    billings: [
      {
        id: "NW-ATL-2026-01",
        customerId: "atlas-grocers-holdings-llc",
        customerName: "Atlas Grocers Holdings, LLC",
        sourceDoc: "atlas-grocers-billing-2026-01.pdf",
        billingNumber: "NW-ATL-2026-01",
        invoiceDate: "2026-01-05",
        dueDate: "2026-02-19",
        poNumber: "PO-ATL-7781",
        billingPeriodStart: "2026-01-01",
        billingPeriodEnd: "2026-01-31",
        billTo: "Atlas Grocers Holdings, LLC",
        remitTo: SELLER_NAME,
        currency: "USD",
        paymentTerms: { netDays: 45, discountPct: 0.02, discountDays: 10 },
        paidDate: "2026-02-15",
        subtotalCents: toCents(43_500),
        taxCents: toCents(0),
        totalCents: toCents(43_500),
        lines: [
          {
            sku: "3PL-FEE",
            description: "3PL distribution & fulfillment — monthly service fee",
            uom: "month",
            qty: 1,
            unitPriceCents: toCents(40_000),
            lineTotalCents: toCents(40_000),
            lineType: "recurring",
            workOrderId: null,
            assetId: null,
            serviceDate: null,
            periodStart: null,
            periodEnd: null,
          },
          {
            sku: "FUEL",
            description: "Fuel surcharge (8.5%)",
            uom: "each",
            qty: 1,
            unitPriceCents: toCents(3_400),
            lineTotalCents: toCents(3_400),
            lineType: "surcharge",
            workOrderId: null,
            assetId: null,
            serviceDate: null,
            periodStart: null,
            periodEnd: null,
          },
          {
            sku: "SVC-REWORK",
            description: "Ad-hoc reslotting service",
            uom: "hour",
            qty: 4,
            unitPriceCents: toCents(25),
            lineTotalCents: toCents(100),
            lineType: "service",
            workOrderId: "WO-2026-0007",
            assetId: "DOCK-12",
            serviceDate: "2026-01-22",
            periodStart: null,
            periodEnd: null,
          },
        ],
      },
      {
        id: "NW-ATL-2026-02",
        customerId: "atlas-grocers-holdings-llc",
        customerName: "Atlas Grocers Holdings, LLC",
        sourceDoc: "atlas-grocers-billing-2026-02.pdf",
        billingNumber: "NW-ATL-2026-02",
        invoiceDate: "2026-02-05",
        dueDate: "2026-03-22",
        poNumber: "PO-ATL-7781",
        billingPeriodStart: "2026-02-01",
        billingPeriodEnd: "2026-02-28",
        billTo: "Atlas Grocers Holdings, LLC",
        remitTo: SELLER_NAME,
        currency: "USD",
        paymentTerms: { netDays: 45, discountPct: 0.02, discountDays: 10 },
        paidDate: null,
        subtotalCents: toCents(39_500),
        taxCents: toCents(0),
        totalCents: toCents(39_500),
        lines: [
          {
            sku: "3PL-FEE",
            description: "3PL distribution & fulfillment — monthly service fee",
            uom: "month",
            qty: 1,
            unitPriceCents: toCents(40_000),
            lineTotalCents: toCents(40_000),
            lineType: "recurring",
            workOrderId: null,
            assetId: null,
            serviceDate: null,
            periodStart: null,
            periodEnd: null,
          },
          {
            sku: "PROMO",
            description: "Introductory discount adjustment",
            uom: "each",
            qty: 1,
            unitPriceCents: toCents(-500),
            lineTotalCents: toCents(-500),
            lineType: "discount",
            workOrderId: null,
            assetId: null,
            serviceDate: null,
            periodStart: null,
            periodEnd: null,
          },
        ],
      },
    ],
    workOrders: [
      {
        customerId: "atlas-grocers-holdings-llc",
        workOrderId: "WO-2026-0007",
        serviceDate: "2026-01-22",
        description: "Ad-hoc reslotting service",
        sku: "SVC-REWORK",
        uom: "hour",
        qty: 4,
        contractedUnitPriceCents: toCents(25),
        status: "invoiced",
      },
      {
        customerId: "atlas-grocers-holdings-llc",
        workOrderId: "WO-2026-0012",
        serviceDate: "2026-02-18",
        description: "Emergency overflow storage",
        sku: "STORAGE-OVF",
        uom: "pallet",
        qty: 120,
        contractedUnitPriceCents: toCents(6.5),
        status: "delivered",
      },
    ],
    arAging: [
      {
        customerId: "atlas-grocers-holdings-llc",
        invoiceNumber: "NW-ATL-2026-02",
        invoiceDate: "2026-02-05",
        dueDate: "2026-03-22",
        balanceCents: toCents(39_500),
        ageDays: 97,
        bucket: "90_plus",
        disputed: true,
        promiseToPayDate: null,
        promiseBroken: true,
        partialPayment: false,
        priorWriteOffs: 1,
      },
      {
        customerId: "atlas-grocers-holdings-llc",
        invoiceNumber: "NW-ATL-2026-03",
        invoiceDate: "2026-03-05",
        dueDate: "2026-04-19",
        balanceCents: toCents(41_000),
        ageDays: 69,
        bucket: "61_90",
        disputed: false,
        promiseToPayDate: "2026-07-10",
        promiseBroken: false,
        partialPayment: true,
        priorWriteOffs: 0,
      },
      {
        customerId: "atlas-grocers-holdings-llc",
        invoiceNumber: "NW-ATL-2026-04",
        invoiceDate: "2026-05-05",
        dueDate: "2026-06-19",
        balanceCents: toCents(40_000),
        ageDays: 8,
        bucket: "1_30",
        disputed: false,
        promiseToPayDate: null,
        promiseBroken: false,
        partialPayment: false,
        priorWriteOffs: 0,
      },
    ],
  });
}

describe("revenue canonical <-> DocModel layout contract", () => {
  it("round-trips a fully-populated customer record losslessly", () => {
    const record = fixture();
    const docs = customerRecordToDocModels(record);
    const dataset = assembleRevenueDataset(docs, SELLER_NAME, ANALYSIS_DATE);
    expect(dataset.customers).toHaveLength(1);
    expect(dataset.customers[0]).toEqual(record);
  });

  it("emits the expected document set with the distinguishing marker fields", () => {
    const record = fixture();
    const docs = customerRecordToDocModels(record);

    const contracts = docs.filter((d) => d.docType === "customer_contract");
    const billings = docs.filter((d) => d.docType === "billing_export");
    const statements = docs.filter((d) => d.docType === "ar_aging");
    expect(contracts).toHaveLength(1);
    expect(billings).toHaveLength(record.billings.length);
    expect(statements).toHaveLength(1);

    expect(docs.map((d) => d.docType)).toEqual([
      "customer_contract",
      ...record.billings.map(() => "billing_export"),
      "ar_aging",
    ]);

    expect(contracts[0].fields.some((f) => f.label === RF.seller)).toBe(true);
    for (const b of billings) {
      expect(b.fields.some((f) => f.label === RF.billingNumber)).toBe(true);
    }
    expect(statements[0].fields.some((f) => f.label === RF.arStatementDate)).toBe(true);
  });
});

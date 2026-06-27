/**
 * Brightseat CRM — SaaS per-seat. Planted findings:
 *   R02 invoice rate mismatch: billed $48.60/seat vs $45.00 contracted on 200
 *       seats => $8,640/yr recoverable.
 *   R06 duplicate: services invoice BS-2026-0412 ($7,500) billed twice.
 */
import { VendorRecordSchema } from "../../types";
import { slug } from "../../docmodel/serialize";
import {
  usd,
  makeContract,
  invoiceSeries,
  makeInvoice,
  months,
  li,
  NET30,
} from "../helpers";
import type { VendorSeed } from "../types";

const name = "Brightseat CRM";
const id = slug(name);

const contract = makeContract({
  vendorName: name,
  category: "SaaS (per-seat)",
  effectiveDate: "2025-01-01",
  endDate: "2026-12-31",
  initialTermMonths: 24,
  autoRenew: true,
  noticeWindowDays: 60,
  governingLaw: "Delaware",
  currentAnnualValueCents: usd(108_000),
  payment: NET30,
  rateCard: [
    { sku: "CRM-SEAT", description: "Professional Seat License", uom: "seat", unitPriceCents: usd(45) },
    { sku: "SUP-PREM", description: "Premium Support Plan", uom: "flat", unitPriceCents: usd(500) },
  ],
  commitment: { contractedSeats: 200, tier: "Professional", tierPricePerSeatCents: usd(45) },
  escalator: { type: "fixed", fixedPct: 0.05, capPct: 0.05, anniversaryMonth: 1 },
  capabilityTags: ["CRM", "Sales Automation"],
  signatory: { name: "Dana Okafor", title: "VP Finance", date: "2024-12-18" },
});

const series = invoiceSeries({
  vendorId: id,
  vendorName: name,
  fileBase: id,
  start: "2025-07-01",
  count: 12,
  numberPrefix: "BS-INV",
  poNumber: "PO-NW-1042",
  payment: NET30,
  ein: "84-1029384",
  lines: () => [
    li({ description: "Professional Seat License", sku: "CRM-SEAT", uom: "seat", qty: 200, unitPriceCents: usd(48.6), lineType: "seat" }),
    li({ description: "Premium Support Plan", sku: "SUP-PREM", uom: "flat", qty: 1, unitPriceCents: usd(500), lineType: "fee" }),
  ],
});

// Duplicate one-time services invoice (R06): same number + amount, billed twice.
const apr = months("2026-04-01", 1)[0];
const servicesInvoice = makeInvoice({
  vendorId: id,
  vendorName: name,
  invoiceNumber: "BS-2026-0412",
  m: apr,
  poNumber: "PO-NW-1188",
  payment: NET30,
  ein: "84-1029384",
  fileBase: `${id}-services`,
  lines: [li({ description: "CRM Implementation & Data Migration (one-time)", sku: "SVC-IMPL", uom: "project", qty: 1, unitPriceCents: usd(7_500), lineType: "fee" })],
});
const servicesDuplicate = { ...servicesInvoice, sourceDoc: `${id}-services-invoice-2026-04-copy.pdf` };

const record = VendorRecordSchema.parse({
  vendor: { id, name, category: "SaaS (per-seat)", aliases: ["Brightseat CRM Inc.", "Brightseat, Inc."] },
  contract,
  invoices: [...series, servicesInvoice, servicesDuplicate],
  usage: [],
});

const overchargePerSeat = usd(48.6) - usd(45); // 360 cents
const seed: VendorSeed = {
  record,
  expected: [
    {
      vendorId: id,
      ruleId: "R02",
      category: "rate_mismatch",
      savingsType: "recovery",
      annualizedSavingsCents: overchargePerSeat * 200 * 12,
      recoverableToDateCents: overchargePerSeat * 200 * 12,
      note: "Invoiced $48.60/seat vs $45.00 contracted, 200 seats, 12 months",
    },
    {
      vendorId: id,
      ruleId: "R06",
      category: "duplicate",
      savingsType: "recovery",
      annualizedSavingsCents: usd(7_500),
      recoverableToDateCents: usd(7_500),
      note: "Services invoice BS-2026-0412 billed twice",
    },
  ],
};

export default seed;

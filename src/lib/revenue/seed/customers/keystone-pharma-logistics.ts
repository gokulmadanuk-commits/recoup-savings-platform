/**
 * Keystone Pharma Logistics — FILLER (clean, correctly billed).
 *
 * A flat GDP-compliant pharma warehousing & distribution contract: $95,000/mo,
 * escalator "none", no commitment / surcharge / discount / price-step. Twelve
 * months of correct flat billings → zero findings. Present for pharma-logistics
 * segment breadth and to seed the AR queue with a large disputed, partially-paid
 * 61–90 day balance.
 */
import { makeCustomerContract, billingSeries, bl, arAging, usd, NET60 } from "../helpers";
import { CustomerRecordSchema } from "../../types";
import type { CustomerSeed } from "../types";

const id = "keystone-pharma-logistics";
const name = "Keystone Pharma Logistics";
const segment = "Pharma logistics";

const contract = makeCustomerContract({
  customerId: id,
  customerName: name,
  segment,
  effectiveDate: "2023-07-01",
  endDate: "2027-06-30",
  initialTermMonths: 12,
  autoRenew: true,
  noticeWindowDays: 90,
  governingLaw: "Pennsylvania",
  auditWindowMonths: 36,
  currentAnnualValueCents: usd(1_140_000),
  payment: NET60,
  escalator: { type: "none" },
  rateCard: [
    {
      sku: "PHARMA-GDP",
      description: "GDP-compliant pharma warehousing & distribution — monthly service fee",
      uom: "month",
      unitPriceCents: usd(95_000),
    },
  ],
  signatory: { name: "Dr. Aisha Rahman", title: "VP Quality & Supply", date: "2023-06-09" },
});

const billings = billingSeries({
  customerId: id,
  customerName: name,
  fileBase: id,
  start: "2025-07-01",
  count: 12,
  numberPrefix: "NW-KPL-2026",
  poNumber: "PO-KPL-7702",
  payment: NET60,
  lines: () => [
    bl({
      description: "GDP-compliant pharma warehousing & distribution — monthly service fee",
      sku: "PHARMA-GDP",
      uom: "month",
      qty: 1,
      unitPriceCents: usd(95_000),
      lineType: "recurring",
    }),
  ],
});

const ar = arAging(id, [
  { invoiceNumber: "NW-KPL-2026-12", invoiceDate: "2026-06-10", ageDays: 7, balanceCents: usd(95_000) },
  { invoiceNumber: "NW-KPL-2026-11", invoiceDate: "2026-05-10", ageDays: 55, balanceCents: usd(95_000) },
  {
    invoiceNumber: "NW-KPL-2026-10",
    invoiceDate: "2026-04-10",
    ageDays: 88,
    balanceCents: usd(62_000),
    disputed: true,
    partialPayment: true,
  },
]);

const record = CustomerRecordSchema.parse({
  customer: { id, name, segment, aliases: ["Keystone Pharma", "Keystone Rx Logistics"] },
  contract,
  billings,
  workOrders: [],
  arAging: ar,
});

const seed: CustomerSeed = { record, expected: [] };

export default seed;

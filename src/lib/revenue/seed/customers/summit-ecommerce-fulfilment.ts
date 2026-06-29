/**
 * Summit E-Commerce Fulfilment — FILLER (clean, correctly billed).
 *
 * A flat DTC pick-pack-ship fulfilment contract: $21,000/mo, escalator "none",
 * no commitment / surcharge / discount / price-step. Twelve months of correct
 * flat billings → zero findings. Present for e-commerce fulfilment breadth and
 * to seed the AR queue, including a kept promise-to-pay and a 90+ day item.
 */
import { makeCustomerContract, billingSeries, bl, arAging, usd, NET30 } from "../helpers";
import { CustomerRecordSchema } from "../../types";
import type { CustomerSeed } from "../types";

const id = "summit-ecommerce-fulfilment";
const name = "Summit E-Commerce Fulfilment";
const segment = "E-commerce fulfilment";

const contract = makeCustomerContract({
  customerId: id,
  customerName: name,
  segment,
  effectiveDate: "2024-01-01",
  endDate: "2026-12-31",
  initialTermMonths: 12,
  autoRenew: true,
  noticeWindowDays: 30,
  governingLaw: "Utah",
  auditWindowMonths: 18,
  currentAnnualValueCents: usd(252_000),
  payment: NET30,
  escalator: { type: "none" },
  rateCard: [
    {
      sku: "FULFIL-DTC",
      description: "DTC pick-pack-ship fulfilment — monthly service fee",
      uom: "month",
      unitPriceCents: usd(21_000),
    },
  ],
  signatory: { name: "Daniel Cho", title: "Head of Operations", date: "2023-12-08" },
});

const billings = billingSeries({
  customerId: id,
  customerName: name,
  fileBase: id,
  start: "2025-07-01",
  count: 12,
  numberPrefix: "NW-SEF-2026",
  poNumber: "PO-SEF-9087",
  payment: NET30,
  lines: () => [
    bl({
      description: "DTC pick-pack-ship fulfilment — monthly service fee",
      sku: "FULFIL-DTC",
      uom: "month",
      qty: 1,
      unitPriceCents: usd(21_000),
      lineType: "recurring",
    }),
  ],
});

const ar = arAging(id, [
  { invoiceNumber: "NW-SEF-2026-12", invoiceDate: "2026-06-05", ageDays: 11, balanceCents: usd(21_000) },
  { invoiceNumber: "NW-SEF-2026-11", invoiceDate: "2026-05-05", ageDays: 40, balanceCents: usd(21_000), promiseToPayDate: "2026-07-10" },
  { invoiceNumber: "NW-SEF-2026-09", invoiceDate: "2026-03-05", ageDays: 110, balanceCents: usd(18_400) },
]);

const record = CustomerRecordSchema.parse({
  customer: { id, name, segment, aliases: ["Summit Fulfilment", "Summit E-Comm"] },
  contract,
  billings,
  workOrders: [],
  arAging: ar,
});

const seed: CustomerSeed = { record, expected: [] };

export default seed;

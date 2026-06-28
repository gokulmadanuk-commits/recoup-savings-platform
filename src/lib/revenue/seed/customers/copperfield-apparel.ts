/**
 * Copperfield Apparel Group — FILLER (clean, correctly billed).
 *
 * A flat apparel-retail distribution & VAS contract: $44,000/mo, escalator
 * "none", no commitment / surcharge / discount / price-step. Twelve months of
 * correct flat billings → zero findings. Present for apparel/retail segment
 * breadth and to seed the AR queue with a current credit balance and a kept
 * promise-to-pay.
 */
import { makeCustomerContract, billingSeries, bl, arAging, usd, NET45 } from "../helpers";
import { CustomerRecordSchema } from "../../types";
import type { CustomerSeed } from "../types";

const id = "copperfield-apparel";
const name = "Copperfield Apparel Group";
const segment = "Apparel retail distribution";

const contract = makeCustomerContract({
  customerId: id,
  customerName: name,
  segment,
  effectiveDate: "2022-03-01",
  endDate: "2027-02-28",
  initialTermMonths: 12,
  autoRenew: true,
  noticeWindowDays: 60,
  governingLaw: "New York",
  auditWindowMonths: 24,
  currentAnnualValueCents: usd(528_000),
  payment: NET45,
  escalator: { type: "none" },
  rateCard: [
    {
      sku: "APPAREL-VAS",
      description: "Apparel distribution & value-added services — monthly service fee",
      uom: "month",
      unitPriceCents: usd(44_000),
    },
  ],
  signatory: { name: "Lillian Cross", title: "SVP Retail Operations", date: "2022-02-07" },
});

const billings = billingSeries({
  customerId: id,
  customerName: name,
  fileBase: id,
  start: "2025-07-01",
  count: 12,
  numberPrefix: "NW-CAG-2026",
  poNumber: "PO-CAG-6644",
  payment: NET45,
  lines: () => [
    bl({
      description: "Apparel distribution & value-added services — monthly service fee",
      sku: "APPAREL-VAS",
      uom: "month",
      qty: 1,
      unitPriceCents: usd(44_000),
      lineType: "recurring",
    }),
  ],
});

const ar = arAging(id, [
  { invoiceNumber: "NW-CAG-2026-12", invoiceDate: "2026-06-18", ageDays: -5, balanceCents: usd(44_000) },
  { invoiceNumber: "NW-CAG-2026-11", invoiceDate: "2026-05-18", ageDays: 27, balanceCents: usd(44_000), promiseToPayDate: "2026-07-05" },
  { invoiceNumber: "NW-CAG-2026-10", invoiceDate: "2026-04-18", ageDays: 70, balanceCents: usd(44_000) },
]);

const record = CustomerRecordSchema.parse({
  customer: { id, name, segment, aliases: ["Copperfield Apparel", "Copperfield Group"] },
  contract,
  billings,
  workOrders: [],
  arAging: ar,
});

const seed: CustomerSeed = { record, expected: [] };

export default seed;

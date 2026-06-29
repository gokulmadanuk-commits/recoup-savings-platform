/**
 * Blue Ridge Courier Network — FILLER (clean, correctly billed).
 *
 * A flat regional last-mile courier contract: $9,000/mo, escalator "none", no
 * commitment / surcharge / discount / price-step. Twelve months of correct flat
 * billings → zero findings. The smallest account in the corpus — present for
 * courier segment breadth and to seed the low end of the AR balance range,
 * including a small 90+ item with prior write-offs.
 */
import { makeCustomerContract, billingSeries, bl, arAging, usd, NET30 } from "../helpers";
import { CustomerRecordSchema } from "../../types";
import type { CustomerSeed } from "../types";

const id = "blue-ridge-courier";
const name = "Blue Ridge Courier Network";
const segment = "Courier & last-mile";

const contract = makeCustomerContract({
  customerId: id,
  customerName: name,
  segment,
  effectiveDate: "2024-05-01",
  endDate: "2026-04-30",
  initialTermMonths: 12,
  autoRenew: true,
  noticeWindowDays: 30,
  governingLaw: "North Carolina",
  auditWindowMonths: 18,
  currentAnnualValueCents: usd(108_000),
  payment: NET30,
  escalator: { type: "none" },
  rateCard: [
    {
      sku: "COURIER-LM",
      description: "Regional last-mile courier network — monthly service fee",
      uom: "month",
      unitPriceCents: usd(9_000),
    },
  ],
  signatory: { name: "Travis Boone", title: "Owner", date: "2024-04-11" },
});

const billings = billingSeries({
  customerId: id,
  customerName: name,
  fileBase: id,
  start: "2025-07-01",
  count: 12,
  numberPrefix: "NW-BRC-2026",
  poNumber: "PO-BRC-5560",
  payment: NET30,
  lines: () => [
    bl({
      description: "Regional last-mile courier network — monthly service fee",
      sku: "COURIER-LM",
      uom: "month",
      qty: 1,
      unitPriceCents: usd(9_000),
      lineType: "recurring",
    }),
  ],
});

const ar = arAging(id, [
  { invoiceNumber: "NW-BRC-2026-12", invoiceDate: "2026-06-05", ageDays: 15, balanceCents: usd(9_000) },
  { invoiceNumber: "NW-BRC-2026-10", invoiceDate: "2026-04-05", ageDays: 62, balanceCents: usd(9_000) },
  { invoiceNumber: "NW-BRC-2026-08", invoiceDate: "2026-02-05", ageDays: 130, balanceCents: usd(8_000), priorWriteOffs: 2 },
]);

const record = CustomerRecordSchema.parse({
  customer: { id, name, segment, aliases: ["Blue Ridge Courier", "BRC Network"] },
  contract,
  billings,
  workOrders: [],
  arAging: ar,
});

const seed: CustomerSeed = { record, expected: [] };

export default seed;

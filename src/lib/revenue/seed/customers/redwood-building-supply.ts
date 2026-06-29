/**
 * Redwood Building Supply — FILLER (clean, correctly billed).
 *
 * A flat wholesale building-materials distribution contract: $67,000/mo,
 * escalator "none", no commitment / surcharge / discount / price-step. Twelve
 * months of correct flat billings → zero findings. Present for wholesale
 * segment breadth and to seed the AR queue with a hard 90+ item that carries a
 * broken promise-to-pay and prior write-offs.
 */
import { makeCustomerContract, billingSeries, bl, arAging, usd, NET45 } from "../helpers";
import { CustomerRecordSchema } from "../../types";
import type { CustomerSeed } from "../types";

const id = "redwood-building-supply";
const name = "Redwood Building Supply";
const segment = "Wholesale distribution";

const contract = makeCustomerContract({
  customerId: id,
  customerName: name,
  segment,
  effectiveDate: "2021-11-01",
  endDate: "2026-10-31",
  initialTermMonths: 12,
  autoRenew: true,
  noticeWindowDays: 60,
  governingLaw: "Oregon",
  auditWindowMonths: 24,
  currentAnnualValueCents: usd(804_000),
  payment: NET45,
  escalator: { type: "none" },
  rateCard: [
    {
      sku: "WHSL-BUILD",
      description: "Wholesale building-materials distribution — monthly service fee",
      uom: "month",
      unitPriceCents: usd(67_000),
    },
  ],
  signatory: { name: "Karen Vasquez", title: "Chief Operating Officer", date: "2021-10-14" },
});

const billings = billingSeries({
  customerId: id,
  customerName: name,
  fileBase: id,
  start: "2025-07-01",
  count: 12,
  numberPrefix: "NW-RBS-2026",
  poNumber: "PO-RBS-1330",
  payment: NET45,
  lines: () => [
    bl({
      description: "Wholesale building-materials distribution — monthly service fee",
      sku: "WHSL-BUILD",
      uom: "month",
      qty: 1,
      unitPriceCents: usd(67_000),
      lineType: "recurring",
    }),
  ],
});

const ar = arAging(id, [
  { invoiceNumber: "NW-RBS-2026-12", invoiceDate: "2026-06-20", ageDays: 2, balanceCents: usd(67_000) },
  { invoiceNumber: "NW-RBS-2026-11", invoiceDate: "2026-05-20", ageDays: 33, balanceCents: usd(67_000) },
  {
    invoiceNumber: "NW-RBS-2025-12",
    invoiceDate: "2025-12-05",
    ageDays: 200,
    balanceCents: usd(84_500),
    promiseToPayDate: "2026-04-15",
    promiseBroken: true,
    priorWriteOffs: 1,
  },
]);

const record = CustomerRecordSchema.parse({
  customer: { id, name, segment, aliases: ["Redwood Bldg Supply", "Redwood Materials"] },
  contract,
  billings,
  workOrders: [],
  arAging: ar,
});

const seed: CustomerSeed = { record, expected: [] };

export default seed;

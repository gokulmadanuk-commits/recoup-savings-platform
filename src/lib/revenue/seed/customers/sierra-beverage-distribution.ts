/**
 * Sierra Beverage Distribution — FILLER (clean, correctly billed).
 *
 * A flat beverage distribution & warehousing contract: $58,000/mo, escalator
 * "none", no commitment / surcharge / discount / price-step. Twelve months of
 * correct flat billings → zero findings. Present for beverage-distribution
 * segment breadth and to seed the AR queue with a partial payment and a large
 * disputed 90+ day balance (the top end of the balance range).
 */
import { makeCustomerContract, billingSeries, bl, arAging, usd, NET30 } from "../helpers";
import { CustomerRecordSchema } from "../../types";
import type { CustomerSeed } from "../types";

const id = "sierra-beverage-distribution";
const name = "Sierra Beverage Distribution";
const segment = "Beverage distribution";

const contract = makeCustomerContract({
  customerId: id,
  customerName: name,
  segment,
  effectiveDate: "2023-02-01",
  endDate: "2027-01-31",
  initialTermMonths: 12,
  autoRenew: true,
  noticeWindowDays: 60,
  governingLaw: "California",
  auditWindowMonths: 24,
  currentAnnualValueCents: usd(696_000),
  payment: NET30,
  escalator: { type: "none" },
  rateCard: [
    {
      sku: "BEV-DIST",
      description: "Beverage distribution & warehousing — monthly service fee",
      uom: "month",
      unitPriceCents: usd(58_000),
    },
  ],
  signatory: { name: "Hector Marin", title: "VP Distribution", date: "2023-01-13" },
});

const billings = billingSeries({
  customerId: id,
  customerName: name,
  fileBase: id,
  start: "2025-07-01",
  count: 12,
  numberPrefix: "NW-SBD-2026",
  poNumber: "PO-SBD-8821",
  payment: NET30,
  lines: () => [
    bl({
      description: "Beverage distribution & warehousing — monthly service fee",
      sku: "BEV-DIST",
      uom: "month",
      qty: 1,
      unitPriceCents: usd(58_000),
      lineType: "recurring",
    }),
  ],
});

const ar = arAging(id, [
  { invoiceNumber: "NW-SBD-2026-12", invoiceDate: "2026-06-05", ageDays: 9, balanceCents: usd(58_000) },
  { invoiceNumber: "NW-SBD-2026-11", invoiceDate: "2026-05-05", ageDays: 50, balanceCents: usd(34_000), partialPayment: true },
  { invoiceNumber: "NW-SBD-2026-01", invoiceDate: "2026-01-05", ageDays: 160, balanceCents: usd(220_000), disputed: true },
]);

const record = CustomerRecordSchema.parse({
  customer: { id, name, segment, aliases: ["Sierra Beverage", "Sierra Bev Dist."] },
  contract,
  billings,
  workOrders: [],
  arAging: ar,
});

const seed: CustomerSeed = { record, expected: [] };

export default seed;

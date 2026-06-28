/**
 * Meadowbrook Foods Distribution — FILLER (clean, correctly billed).
 *
 * A flat ambient food-distribution 3PL contract: $52,000/mo, escalator "none",
 * no commitment / surcharge / discount / price-step complications. Twelve months
 * of correct flat billings, so the rule set finds nothing. Present purely for
 * segment breadth and to populate the collections AR aging queue.
 */
import { makeCustomerContract, billingSeries, bl, arAging, usd, NET30 } from "../helpers";
import { CustomerRecordSchema } from "../../types";
import type { CustomerSeed } from "../types";

const id = "meadowbrook-foods";
const name = "Meadowbrook Foods Distribution";
const segment = "Food distribution";

const contract = makeCustomerContract({
  customerId: id,
  customerName: name,
  segment,
  effectiveDate: "2023-04-01",
  endDate: "2027-03-31",
  initialTermMonths: 12,
  autoRenew: true,
  noticeWindowDays: 60,
  governingLaw: "Indiana",
  auditWindowMonths: 24,
  currentAnnualValueCents: usd(624_000),
  payment: NET30,
  escalator: { type: "none" },
  rateCard: [
    {
      sku: "DIST-AMBIENT",
      description: "Ambient food distribution & cross-dock — monthly service fee",
      uom: "month",
      unitPriceCents: usd(52_000),
    },
  ],
  signatory: { name: "Gregory Halloran", title: "Director of Logistics", date: "2023-03-10" },
});

const billings = billingSeries({
  customerId: id,
  customerName: name,
  fileBase: id,
  start: "2025-07-01",
  count: 12,
  numberPrefix: "NW-MBF-2026",
  poNumber: "PO-MBF-4471",
  payment: NET30,
  lines: () => [
    bl({
      description: "Ambient food distribution & cross-dock — monthly service fee",
      sku: "DIST-AMBIENT",
      uom: "month",
      qty: 1,
      unitPriceCents: usd(52_000),
      lineType: "recurring",
    }),
  ],
});

const ar = arAging(id, [
  { invoiceNumber: "NW-MBF-2026-12", invoiceDate: "2026-06-05", ageDays: 5, balanceCents: usd(52_000) },
  { invoiceNumber: "NW-MBF-2026-11", invoiceDate: "2026-05-05", ageDays: 22, balanceCents: usd(31_500), partialPayment: true },
  { invoiceNumber: "NW-MBF-2026-10", invoiceDate: "2026-04-05", ageDays: 48, balanceCents: usd(52_000) },
]);

const record = CustomerRecordSchema.parse({
  customer: { id, name, segment, aliases: ["Meadowbrook Foods", "Meadowbrook Dist."] },
  contract,
  billings,
  workOrders: [],
  arAging: ar,
});

const seed: CustomerSeed = { record, expected: [] };

export default seed;

/**
 * Atlantic Cold Chain Co. — FILLER (clean, correctly billed).
 *
 * A flat refrigerated-warehousing contract: $38,000/mo, escalator "none", no
 * commitment / surcharge / discount / price-step. Twelve months of correct flat
 * billings → zero findings. Present for cold-chain segment breadth and to seed
 * the collections AR queue (including one disputed 61–90 day item).
 */
import { makeCustomerContract, billingSeries, bl, arAging, usd, NET45 } from "../helpers";
import { CustomerRecordSchema } from "../../types";
import type { CustomerSeed } from "../types";

const id = "atlantic-cold-chain";
const name = "Atlantic Cold Chain Co.";
const segment = "Cold-chain warehousing";

const contract = makeCustomerContract({
  customerId: id,
  customerName: name,
  segment,
  effectiveDate: "2022-09-01",
  endDate: "2026-08-31",
  initialTermMonths: 12,
  autoRenew: true,
  noticeWindowDays: 90,
  governingLaw: "New Jersey",
  auditWindowMonths: 24,
  currentAnnualValueCents: usd(456_000),
  payment: NET45,
  escalator: { type: "none" },
  rateCard: [
    {
      sku: "COLD-PALLET",
      description: "Refrigerated pallet storage & handling — monthly service fee",
      uom: "month",
      unitPriceCents: usd(38_000),
    },
  ],
  signatory: { name: "Priya Anand", title: "VP Supply Chain", date: "2022-08-12" },
});

const billings = billingSeries({
  customerId: id,
  customerName: name,
  fileBase: id,
  start: "2025-07-01",
  count: 12,
  numberPrefix: "NW-ACC-2026",
  poNumber: "PO-ACC-2218",
  payment: NET45,
  lines: () => [
    bl({
      description: "Refrigerated pallet storage & handling — monthly service fee",
      sku: "COLD-PALLET",
      uom: "month",
      qty: 1,
      unitPriceCents: usd(38_000),
      lineType: "recurring",
    }),
  ],
});

const ar = arAging(id, [
  { invoiceNumber: "NW-ACC-2026-12", invoiceDate: "2026-06-15", ageDays: -3, balanceCents: usd(38_000) },
  { invoiceNumber: "NW-ACC-2026-11", invoiceDate: "2026-05-15", ageDays: 18, balanceCents: usd(38_000) },
  { invoiceNumber: "NW-ACC-2026-10", invoiceDate: "2026-04-15", ageDays: 75, balanceCents: usd(41_200), disputed: true },
]);

const record = CustomerRecordSchema.parse({
  customer: { id, name, segment, aliases: ["Atlantic Cold Chain", "ACC Cold Storage"] },
  contract,
  billings,
  workOrders: [],
  arAging: ar,
});

const seed: CustomerSeed = { record, expected: [] };

export default seed;

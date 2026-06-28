/**
 * Continental Auto Parts Distribution — PLANTED RL07 (fuel surcharge never billed).
 *
 * A warehousing + outbound-freight contract signed Jul 2025 at $528,000/yr
 * ($44,000/mo base recurring) with an explicit fuel-surcharge pass-through:
 *   surcharges = [{ kind:"fuel", ratePct: 0.085, basis: "EIA on-highway diesel, monthly" }]
 * Twelve months were billed at the flat $44,000 base with NO surcharge line.
 *
 * Hand arithmetic (integer cents, ratePct 0.085 applied per month):
 *   base/mo            = $44,000.00            = 4,400,000 cents
 *   surcharge/mo       = round(4,400,000 × 0.085) = round(374,000) = 374,000 cents = $3,740.00
 *   billed months      = 12 (all carry the recurring base, none a surcharge line)
 *   arrears (recovery) = 12 × 374,000          = 4,488,000 cents = $44,880.00
 *   uplift  (forward)  = 374,000 × 12          = 4,488,000 cents = $44,880.00
 *   total              = 4,488,000 + 4,488,000 = 8,976,000 cents = $89,760.00
 * arrears == uplift → recoveryType "arrears".
 *
 * Explicit, mechanical pass-through billed flat for only the recent window
 * (effective Jul 2025, 24-month audit right) → relationship-risk grade A
 * (back-bill in-window arrears + correct forward).
 */
import {
  makeCustomerContract,
  billingSeries,
  bl,
  arAging,
  usd,
} from "../helpers";
import { CustomerRecordSchema } from "../../types";
import type { CustomerSeed } from "../types";

const id = "continental-auto-parts";
const name = "Continental Auto Parts Distribution, Inc.";
const segment = "Auto-parts distribution";

const contract = makeCustomerContract({
  customerId: id,
  customerName: name,
  segment,
  effectiveDate: "2025-07-01",
  endDate: "2028-06-30",
  initialTermMonths: 36,
  autoRenew: true,
  noticeWindowDays: 60,
  governingLaw: "Michigan",
  auditWindowMonths: 24,
  currentAnnualValueCents: usd(528_000), // $44,000/mo × 12
  payment: { netDays: 30, discountPct: 0, discountDays: 0 },
  surcharges: [
    {
      kind: "fuel",
      label: "Fuel surcharge",
      basis: "EIA on-highway diesel, monthly",
      ratePct: 0.085,
    },
  ],
  rateCard: [
    {
      sku: "WH-FREIGHT",
      description: "Warehousing & outbound freight — monthly service fee",
      uom: "month",
      unitPriceCents: usd(44_000),
    },
  ],
  signatory: { name: "Daniel Korhonen", title: "Director of Logistics", date: "2025-06-18" },
});

const billings = billingSeries({
  customerId: id,
  customerName: name,
  fileBase: id,
  start: "2025-07-01",
  count: 12,
  numberPrefix: "NW-CAP-2026",
  poNumber: "PO-CAP-7742",
  payment: { netDays: 30, discountPct: 0, discountDays: 0 },
  // Base recurring only — the contractual fuel surcharge line is missing.
  lines: () => [
    bl({
      description: "Warehousing & outbound freight — monthly service fee",
      sku: "WH-FREIGHT",
      uom: "month",
      qty: 1,
      unitPriceCents: usd(44_000),
      lineType: "recurring",
    }),
  ],
});

const ar = arAging(id, [
  { invoiceNumber: "NW-CAP-2026-12", invoiceDate: "2026-06-05", ageDays: 7, balanceCents: usd(44_000) },
  { invoiceNumber: "NW-CAP-2026-11", invoiceDate: "2026-05-05", ageDays: 38, balanceCents: usd(44_000) },
]);

const record = CustomerRecordSchema.parse({
  customer: { id, name, segment, aliases: ["Continental Auto Parts", "CAP Distribution"] },
  contract,
  billings,
  workOrders: [],
  arAging: ar,
});

const seed: CustomerSeed = {
  record,
  expected: [
    {
      customerId: id,
      ruleId: "RL07",
      category: "missing_surcharge",
      recoveryType: "arrears",
      arrearsToDateCents: 4_488_000, // $44,880.00 (12 × $3,740 surcharge)
      annualizedUpliftCents: 4_488_000, // $44,880.00 ($3,740/mo × 12 forward)
      totalRecoverableCents: 8_976_000, // $89,760.00
      relationshipRisk: "A",
      note: "8.5% fuel surcharge (EIA diesel) never billed; base flat at $44k/mo.",
    },
  ],
};

export default seed;

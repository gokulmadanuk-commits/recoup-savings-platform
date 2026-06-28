/**
 * Evergreen Wholesale Foods — PLANTED RL11 (rebate over-credited).
 *
 * A wholesale-grocery distribution contract carries a VALID volume rebate of 5%
 * (effective through 2027-12-31 — still in force). Billing, however, applies a
 * discount line of −$4,000/mo against $50,000/mo gross recurring, i.e. 8% — three
 * percentage points more than the contracted 5%. The seller over-credited the
 * customer.
 *
 * Hand-derived answer key (12 billed months, July 2025 → June 2026):
 *   gross recurring        = $50,000.00 / mo
 *   allowed credit  (5%)   = $50,000 × 0.05 = $2,500.00 / mo
 *   actual credit          = $4,000.00 / mo
 *   monthly excess         = $4,000 − $2,500 = $1,500.00 / mo
 *   arrears (12 × $1,500)  = $18,000.00            => 1_800_000 cents
 *   uplift  ($1,500 × 12)  = $18,000.00            => 1_800_000 cents
 *   total recoverable      = $36,000.00            => 3_600_000 cents
 * arrears >= uplift ⇒ recoveryType "arrears". A recent, discrete over-credit
 * (12 in-window months) ⇒ relationship-risk grade A (retroactive claim).
 */
import {
  makeCustomerContract,
  billingSeries,
  bl,
  arAging,
  usd,
  NET30,
} from "../helpers";
import { CustomerRecordSchema } from "../../types";
import type { CustomerSeed } from "../types";

const id = "evergreen-wholesale-foods";
const name = "Evergreen Wholesale Foods, Inc.";
const segment = "Wholesale grocery";

const contract = makeCustomerContract({
  customerId: id,
  customerName: name,
  segment,
  effectiveDate: "2024-01-01",
  endDate: "2027-12-31",
  initialTermMonths: 12,
  autoRenew: true,
  noticeWindowDays: 60,
  governingLaw: "Washington",
  auditWindowMonths: 24,
  currentAnnualValueCents: usd(600_000), // $50,000/mo gross recurring
  payment: NET30,
  // VALID (non-expired) 5% volume rebate — still in force on the analysis date.
  introDiscount: { pct: 0.05, expiryDate: "2027-12-31", appliesToSku: null },
  rateCard: [
    {
      sku: "WHSE-DIST",
      description: "Warehousing & wholesale distribution — monthly service fee",
      uom: "month",
      unitPriceCents: usd(50_000),
    },
  ],
  signatory: { name: "Daniel Brooks", title: "Director of Procurement", date: "2023-12-12" },
});

// 12 months: $50,000 gross recurring with a −$4,000 discount line (8%, vs the
// contracted 5% = −$2,500). Over-credited by $1,500/mo.
const billings = billingSeries({
  customerId: id,
  customerName: name,
  fileBase: id,
  start: "2025-07-01",
  count: 12,
  numberPrefix: "NW-EWF-2026",
  poNumber: "PO-EWF-7720",
  payment: NET30,
  lines: () => [
    bl({
      description: "Warehousing & wholesale distribution — monthly service fee",
      sku: "WHSE-DIST",
      uom: "month",
      qty: 1,
      unitPriceCents: usd(50_000),
      lineType: "recurring",
    }),
    bl({
      description: "Volume rebate",
      sku: "WHSE-DIST",
      uom: "month",
      qty: 1,
      unitPriceCents: usd(-4_000),
      lineType: "discount",
    }),
  ],
});

const ar = arAging(id, [
  { invoiceNumber: "NW-EWF-2026-11", invoiceDate: "2026-05-05", ageDays: 7, balanceCents: usd(46_000) },
  { invoiceNumber: "NW-EWF-2026-10", invoiceDate: "2026-04-05", ageDays: 38, balanceCents: usd(46_000) },
]);

const record = CustomerRecordSchema.parse({
  customer: { id, name, segment, aliases: ["Evergreen Wholesale"] },
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
      ruleId: "RL11",
      category: "rebate_over_credit",
      recoveryType: "arrears",
      arrearsToDateCents: 1_800_000, // $18,000.00 (12 × $1,500 excess)
      annualizedUpliftCents: 1_800_000, // $18,000.00 ($1,500/mo × 12 forward)
      totalRecoverableCents: 3_600_000, // $36,000.00
      relationshipRisk: "A",
      note: "Valid 5% rebate over-applied at 8% (−$4,000 vs −$2,500 on $50k gross) for 12 months.",
    },
  ],
};

export default seed;

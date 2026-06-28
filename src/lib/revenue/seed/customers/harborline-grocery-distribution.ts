/**
 * Harborline Grocery Distribution — PLANTED RL02 (scheduled price step missed).
 *
 * A grocery-distribution 3PL contract whose pricing schedule steps the monthly
 * recurring service fee from $52,000/mo to $56,000/mo effective 2025-10-01. Every
 * billing on/after that date still charges the OLD $52,000/mo — a $4,000/mo gap.
 *
 * Billing series: 12 months Jul-2025 .. Jun-2026 (invoice on the 5th). Billings
 * dated on/after 2025-10-01 are the nine months Oct-2025 .. Jun-2026:
 *   2025-10-05, 2025-11-05, 2025-12-05, 2026-01-05, 2026-02-05,
 *   2026-03-05, 2026-04-05, 2026-05-05, 2026-06-05  → 9 under-billed months.
 *
 * Answer key (by hand):
 *   shortfall/mo = $56,000 − $52,000      = $4,000   = 400,000 cents
 *   arrears      = 9 × $4,000             = $36,000  = 3,600,000 cents
 *   uplift       = $4,000 × 12 (annualised) = $48,000 = 4,800,000 cents
 *   total        = $36,000 + $48,000      = $84,000  = 8,400,000 cents
 *   uplift > arrears → recoveryType = "uplift"
 *   blended fee  = round(3,600,000 × 0.3) + round(4,800,000 × 0.2)
 *                = 1,080,000 + 960,000   = 2,040,000 cents ($20,400)
 *   risk: entitlement 0.9, auditWindow 1.0, waiver 0.9, relationship 0.7
 *         → score 3.5, canClaim & ≥3.0 → grade A
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

const id = "harborline-grocery-distribution";
const name = "Harborline Grocery Distribution, Inc.";
const segment = "Grocery distribution";

const OLD_PRICE = usd(52_000); // billed (wrong)
const NEW_PRICE = usd(56_000); // stepped (correct, effective 2025-10-01)

const contract = makeCustomerContract({
  customerId: id,
  customerName: name,
  segment,
  effectiveDate: "2023-08-01",
  endDate: "2027-07-31",
  initialTermMonths: 24,
  autoRenew: true,
  noticeWindowDays: 60,
  governingLaw: "Washington",
  auditWindowMonths: 24,
  currentAnnualValueCents: usd(624_000), // $52,000/mo × 12 (as currently billed)
  payment: NET30,
  rateCard: [
    {
      sku: "GROC-3PL",
      description: "Grocery distribution & cold-chain fulfillment — monthly service fee",
      uom: "month",
      unitPriceCents: OLD_PRICE,
    },
  ],
  priceIncreaseSchedule: [
    {
      effectiveDate: "2025-10-01",
      newUnitPriceCents: NEW_PRICE,
      sku: "GROC-3PL",
      note: "Scheduled Price Increase (Schedule B, Year-3 step)",
    },
  ],
  signatory: { name: "Daniel Okafor", title: "VP Supply Chain", date: "2023-07-18" },
});

const billings = billingSeries({
  customerId: id,
  customerName: name,
  fileBase: id,
  start: "2025-07-01",
  count: 12,
  numberPrefix: "NW-HARB-2026",
  poNumber: "PO-HARB-4477",
  payment: NET30,
  // Bug planted: still billing OLD_PRICE every month, including post-step months.
  lines: () => [
    bl({
      description: "Grocery distribution & cold-chain fulfillment — monthly service fee",
      sku: "GROC-3PL",
      uom: "month",
      qty: 1,
      unitPriceCents: OLD_PRICE,
      lineType: "recurring",
    }),
  ],
});

const ar = arAging(id, [
  { invoiceNumber: "NW-HARB-2026-12", invoiceDate: "2026-06-05", ageDays: 12, balanceCents: OLD_PRICE },
  { invoiceNumber: "NW-HARB-2026-11", invoiceDate: "2026-05-05", ageDays: 43, balanceCents: OLD_PRICE },
]);

const record = CustomerRecordSchema.parse({
  customer: { id, name, segment, aliases: ["Harborline Grocery Dist."] },
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
      ruleId: "RL02",
      category: "price_step_missed",
      recoveryType: "uplift",
      arrearsToDateCents: 3_600_000, // $36,000.00 (9 months × $4,000)
      annualizedUpliftCents: 4_800_000, // $48,000.00 ($4,000/mo × 12)
      totalRecoverableCents: 8_400_000, // $84,000.00
      relationshipRisk: "A",
      note: "Scheduled $52k→$56k/mo step (eff. 2025-10-01) never applied; 9 months under-billed.",
    },
  ],
};

export default seed;

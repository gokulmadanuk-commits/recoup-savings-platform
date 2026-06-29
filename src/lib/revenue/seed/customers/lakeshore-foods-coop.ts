/**
 * Lakeshore Foods Co-op — PLANTED RL06 (minimum-commitment / take-or-pay shortfall).
 *
 * A food-distribution co-op on a 3PL warehousing & distribution MSA signed Mar 2024
 * with an ANNUAL take-or-pay floor of $600,000/yr (commitment.minCommitSpendCents,
 * measurementPeriod "annual"). Actual demand ran soft: billed flat at $42,500/mo,
 * so the trailing 12 months total only $510,000. The $90,000 shortfall is owed under
 * the minimum-commitment clause but was never invoiced.
 *
 * Hand arithmetic (integer cents, trailing-12-month window ending 2026-06-27):
 *   billed   = 12 × $42,500.00            = $510,000.00 = 51,000,000c
 *   minimum  =                              $600,000.00 = 60,000,000c
 *   arrears  = 60,000,000 − 51,000,000    = $ 90,000.00 =  9,000,000c
 *   uplift   = 0 (one-time true-up, not a forward run-rate change)
 *   total    = 9,000,000c
 *   fee      = round(9,000,000 × 0.30) + round(0 × 0.20) = 2,700,000c
 * Discrete, recent annual shortfall + unconditional take-or-pay entitlement, whole
 * gap in-window → relationship-risk grade A (retroactive true-up).
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

const id = "lakeshore-foods-coop";
const name = "Lakeshore Foods Co-op";

const contract = makeCustomerContract({
  customerId: id,
  customerName: name,
  segment: "Food distribution",
  effectiveDate: "2024-03-01",
  endDate: "2027-02-28",
  initialTermMonths: 36,
  autoRenew: true,
  noticeWindowDays: 90,
  governingLaw: "Wisconsin",
  auditWindowMonths: 24,
  currentAnnualValueCents: usd(600_000),
  payment: NET30,
  commitment: {
    minCommitSpendCents: usd(600_000), // annual take-or-pay floor
    measurementPeriod: "annual",
  },
  rateCard: [
    {
      sku: "WHSE-DIST",
      description: "Warehousing & distribution — monthly service fee",
      uom: "month",
      unitPriceCents: usd(42_500),
    },
  ],
  signatory: { name: "Dale Brunner", title: "General Manager", date: "2024-02-12" },
});

// 12 trailing months billed flat at $42,500/mo = $510,000 (below the $600k floor).
const billings = billingSeries({
  customerId: id,
  customerName: name,
  fileBase: id,
  start: "2025-07-01",
  count: 12,
  numberPrefix: "NW-LFC-2026",
  poNumber: "PO-LFC-4821",
  payment: NET30,
  lines: () => [
    bl({
      description: "Warehousing & distribution — monthly service fee",
      sku: "WHSE-DIST",
      uom: "month",
      qty: 1,
      unitPriceCents: usd(42_500),
      lineType: "recurring",
    }),
  ],
});

const ar = arAging(id, [
  { invoiceNumber: "NW-LFC-2026-12", invoiceDate: "2026-06-05", ageDays: 6, balanceCents: usd(42_500) },
  { invoiceNumber: "NW-LFC-2026-11", invoiceDate: "2026-05-05", ageDays: 37, balanceCents: usd(42_500) },
]);

const record = CustomerRecordSchema.parse({
  customer: { id, name, segment: "Food distribution", aliases: ["Lakeshore Foods", "Lakeshore Co-op"] },
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
      ruleId: "RL06",
      category: "min_commit_shortfall",
      recoveryType: "arrears",
      arrearsToDateCents: 9_000_000, // $90,000.00 (minimum − trailing-12 billed)
      annualizedUpliftCents: 0, // one-time true-up
      totalRecoverableCents: 9_000_000,
      relationshipRisk: "A",
      note: "Annual take-or-pay floor $600k never enforced; only $510k billed over trailing 12mo.",
    },
  ],
};

export default seed;

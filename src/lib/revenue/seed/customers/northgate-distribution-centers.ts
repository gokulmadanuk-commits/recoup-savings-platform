/**
 * Northgate Distribution Centers — PLANTED RL09 (auto-renewal repriced at the old rate).
 *
 * An evergreen warehousing MSA signed Sep 2022 at $54,000/mo. It auto-renewed on
 * 2025-09-01, and the rate card's currently-effective line (effectiveFrom
 * 2025-09-01) carries the post-renewal list price at $58,000/mo — but billing has
 * continued at the lapsed $54,000/mo ever since. The rule keys strictly off the
 * rate card's currently-effective unit price vs. the recurring price billed after
 * the renewal (no escalator, no price-increase schedule).
 *
 * Hand-derived answer key (analysis date 2026-06-27):
 *   list $58,000/mo − billed $54,000/mo = $4,000/mo gap  (= 400,000 cents)
 *   post-renewal billed months Sep 2025 … Jun 2026 = 10
 *   arrears = 400,000 × 10 = 4,000,000 cents = $40,000.00
 *   uplift  = 400,000 × 12 = 4,800,000 cents = $48,000.00   (uplift dominates → recoveryType "uplift")
 *   total   = 8,800,000 cents = $88,000.00
 * Recent/discrete gap (9 calendar months): waiverEstoppel 1.0, auditWindow 1.0,
 * entitlement 0.95, relationship 0.4 → score 3.35 → relationship-risk grade A.
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

const id = "northgate-distribution-centers";
const name = "Northgate Distribution Centers, Inc.";

const PRIOR_RATE = usd(54_000); // pre-renewal list, still being billed
const LIST_RATE = usd(58_000); // post-renewal list per the current rate card

const contract = makeCustomerContract({
  customerId: id,
  customerName: name,
  segment: "Warehousing",
  effectiveDate: "2022-09-01",
  endDate: "2026-08-31",
  initialTermMonths: 36,
  autoRenew: true,
  renewalTermMonths: 12,
  noticeWindowDays: 90,
  governingLaw: "Indiana",
  auditWindowMonths: 24,
  currentAnnualValueCents: usd(696_000), // $58,000 × 12 (current list run-rate)
  payment: NET30,
  // No escalator and no priceIncreaseSchedule — the signal is the rate card +
  // the auto-renewal, deliberately not RL01/RL02 mechanisms.
  escalator: { type: "none" },
  rateCard: [
    {
      sku: "WHS-FEE",
      description: "Dedicated warehousing & fulfillment — monthly facility fee",
      uom: "month",
      unitPriceCents: PRIOR_RATE,
      effectiveFrom: "2022-09-01",
      effectiveTo: "2025-08-31",
    },
    {
      sku: "WHS-FEE",
      description: "Dedicated warehousing & fulfillment — monthly facility fee",
      uom: "month",
      unitPriceCents: LIST_RATE,
      effectiveFrom: "2025-09-01",
      effectiveTo: null,
    },
  ],
  signatory: { name: "Daniel Reyes", title: "Director of Logistics", date: "2022-08-18" },
});

// 10 billings: Sep 2025 → Jun 2026, all at the lapsed $54,000/mo (never repriced).
const billings = billingSeries({
  customerId: id,
  customerName: name,
  fileBase: id,
  start: "2025-09-01",
  count: 10,
  numberPrefix: "NW-NGD-2026",
  poNumber: "PO-NGD-7742",
  payment: NET30,
  lines: () => [
    bl({
      description: "Dedicated warehousing & fulfillment — monthly facility fee",
      sku: "WHS-FEE",
      uom: "month",
      qty: 1,
      unitPriceCents: PRIOR_RATE,
      lineType: "recurring",
    }),
  ],
});

const ar = arAging(id, [
  { invoiceNumber: "NW-NGD-2026-10", invoiceDate: "2026-06-05", ageDays: 6, balanceCents: PRIOR_RATE },
  { invoiceNumber: "NW-NGD-2026-09", invoiceDate: "2026-05-05", ageDays: 37, balanceCents: PRIOR_RATE },
]);

const record = CustomerRecordSchema.parse({
  customer: {
    id,
    name,
    segment: "Warehousing",
    aliases: ["Northgate DC", "Northgate Distribution"],
  },
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
      ruleId: "RL09",
      category: "renewal_repricing",
      recoveryType: "uplift",
      arrearsToDateCents: 4_000_000, // $40,000.00 (10 months × $4,000 gap)
      annualizedUpliftCents: 4_800_000, // $48,000.00 ($4,000 gap × 12)
      totalRecoverableCents: 8_800_000, // $88,000.00
      relationshipRisk: "A",
      note: "Evergreen renewal (2025-09-01) repriced list to $58k/mo; still billing the lapsed $54k/mo.",
    },
  ],
};

export default seed;

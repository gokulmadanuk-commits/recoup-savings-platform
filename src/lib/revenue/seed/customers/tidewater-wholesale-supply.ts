/**
 * Tidewater Wholesale Supply Co. — PLANTED RL04 (graduated-tier breach).
 *
 * A wholesale distribution contract whose pallet-handling fee is a GRADUATED
 * tier schedule:
 *   tier 1:   0–4,000 pallets/mo  @ $12 / pallet
 *   tier 2:  above 4,000/mo       @ $15 / pallet  (premium capacity)
 *
 * The customer ships 5,200 pallets/mo. The correct graduated charge is
 *   4,000 × $12 + 1,200 × $15 = $48,000 + $18,000 = $66,000 / mo
 * but billing applies the base $12 rate flat across the whole quantity:
 *   5,200 × $12 = $62,400 / mo  →  under by $3,600 / mo.
 *
 * ── Answer-key arithmetic (by hand) ───────────────────────────────────────────
 * Billing series: 12 monthly docs, 2025-07 … 2026-06. ANALYSIS_DATE = 2026-06-27.
 * Completed months = those whose billing-period END is on/before 2026-06-27:
 *   2025-07 (ends 2025-07-31) … 2026-05 (ends 2026-05-31)  → 11 months complete.
 *   2026-06 ends 2026-06-30 (> 2026-06-27)                 → NOT complete.
 * Monthly under-billing gap = $66,000 − $62,400 = $3,600.
 *   arrears = 11 × $3,600 = $39,600.00   →  3,960,000 cents
 *   uplift  = $3,600 × 12 = $43,200.00   →  4,320,000 cents (forward run-rate)
 *   total   = $82,800.00                 →  8,280,000 cents
 * uplift > arrears  →  recoveryType = "uplift".
 * Recent/discrete breach (11 mo) → waiverEstoppel 0.9, auditWindow 1.0,
 * entitlement 0.9, relationship 0.5 → score 3.3 → relationship-risk grade A.
 * Blended fee = round(3,960,000 × 0.3) + round(4,320,000 × 0.2)
 *             = 1,188,000 + 864,000 = 2,052,000 cents.
 * ──────────────────────────────────────────────────────────────────────────────
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

const id = "tidewater-wholesale-supply";
const name = "Tidewater Wholesale Supply Co.";
const segment = "Wholesale distribution";

const PALLETS_PER_MONTH = 5_200;
const BASE_RATE = usd(12); // tier 1: 0–4,000 pallets
const PREMIUM_RATE = usd(15); // tier 2: above 4,000 pallets
const TIER_BREAK = 4_000;

const contract = makeCustomerContract({
  customerId: id,
  customerName: name,
  segment,
  effectiveDate: "2025-01-01",
  endDate: "2027-12-31",
  initialTermMonths: 36,
  autoRenew: true,
  noticeWindowDays: 60,
  governingLaw: "Virginia",
  auditWindowMonths: 24,
  // Correct graduated run-rate: $66,000/mo × 12 = $792,000/yr.
  currentAnnualValueCents: usd(792_000),
  payment: NET30,
  tiers: [
    { tierMin: 0, tierMax: TIER_BREAK, unitPriceCents: BASE_RATE },
    { tierMin: TIER_BREAK, tierMax: null, unitPriceCents: PREMIUM_RATE },
  ],
  rateCard: [
    {
      sku: "WHSE-PALLET",
      description: "Pallet handling & storage — per pallet/mo (graduated tiers)",
      uom: "pallet",
      unitPriceCents: BASE_RATE,
    },
  ],
  signatory: { name: "Dale Pruitt", title: "Director of Logistics", date: "2024-12-12" },
});

// Billed FLAT at the base $12 rate across all 5,200 pallets — the planted breach.
const billings = billingSeries({
  customerId: id,
  customerName: name,
  fileBase: id,
  start: "2025-07-01",
  count: 12,
  numberPrefix: "NW-TWS-2026",
  poNumber: "PO-TWS-7742",
  payment: NET30,
  lines: () => [
    bl({
      description: "Pallet handling & storage — monthly volume",
      sku: "WHSE-PALLET",
      uom: "pallet",
      qty: PALLETS_PER_MONTH,
      unitPriceCents: BASE_RATE, // flat $12 → 5,200 × $12 = $62,400 (under-billed)
      lineType: "usage",
    }),
  ],
});

const ar = arAging(id, [
  { invoiceNumber: "NW-TWS-2026-11", invoiceDate: "2026-05-05", ageDays: 7, balanceCents: usd(62_400) },
  { invoiceNumber: "NW-TWS-2026-10", invoiceDate: "2026-04-05", ageDays: 38, balanceCents: usd(62_400) },
]);

const record = CustomerRecordSchema.parse({
  customer: { id, name, segment, aliases: ["Tidewater Wholesale", "Tidewater Supply Co."] },
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
      ruleId: "RL04",
      category: "tier_breach",
      recoveryType: "uplift",
      arrearsToDateCents: 3_960_000, // $39,600.00 (11 completed months × $3,600)
      annualizedUpliftCents: 4_320_000, // $43,200.00 ($3,600/mo × 12)
      totalRecoverableCents: 8_280_000, // $82,800.00
      relationshipRisk: "A",
      note: "Graduated tier breached: 5,200 pallets/mo billed flat at $12 instead of 4,000×$12 + 1,200×$15.",
    },
  ],
};

export default seed;

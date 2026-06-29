/**
 * Granite Peak Manufacturing — PLANTED RL05 (unbilled overage above allowance).
 *
 * A bonded-storage / 3PL manufacturing contract: the commitment bundles 8,000
 * cu-ft/mo of bonded storage and entitles Northwind to bill consumption above it
 * at $2.00/cu-ft. The plant's metered usage runs a steady 9,500 cu-ft/mo — 1,500
 * over the allowance — but the billings only carry the flat base storage fee and
 * the metered usage line; NO overage line was ever raised.
 *
 *   excess/mo            = 9,500 − 8,000 = 1,500 cu-ft
 *   monthly overage owed = 1,500 × $2.00  = $3,000.00
 *   billed months        = 12  (no overage billed in any)
 *   arrears (to date)    = 12 × $3,000.00 = $36,000.00   (3,600,000 cents)
 *   uplift (forward 12mo)= $3,000.00 × 12 = $36,000.00   (3,600,000 cents)
 *   total recoverable    = $72,000.00                    (7,200,000 cents)
 *
 * Recent, ongoing meter-vs-bill gap (12 months, fully inside the 24-mo audit
 * window, seller's own metered record) → relationship-risk grade A (clean
 * retroactive claim + forward correction).
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

const id = "granite-peak-manufacturing";
const name = "Granite Peak Manufacturing, Inc.";
const segment = "Manufacturing";

const ALLOWANCE = 8_000; // cu-ft of bonded storage included each month
const OVERAGE_RATE = usd(2); // $2.00 / cu-ft above the allowance
const USED = 9_500; // metered cu-ft consumed each month
const BASE_FEE = usd(15_000); // flat monthly bonded-storage base fee

const contract = makeCustomerContract({
  customerId: id,
  customerName: name,
  segment,
  effectiveDate: "2023-09-01",
  endDate: "2027-08-31",
  initialTermMonths: 12,
  autoRenew: true,
  noticeWindowDays: 60,
  governingLaw: "Colorado",
  auditWindowMonths: 24,
  currentAnnualValueCents: usd(180_000), // $15,000/mo base storage fee
  payment: NET30,
  commitment: {
    measurementPeriod: "monthly",
    includedAllowance: ALLOWANCE,
    overageUnitPriceCents: OVERAGE_RATE,
  },
  rateCard: [
    {
      sku: "BOND-STG",
      description: "Bonded warehouse storage — monthly base fee (8,000 cu-ft allowance)",
      uom: "month",
      unitPriceCents: BASE_FEE,
    },
    {
      sku: "BOND-OVG",
      description: "Bonded storage overage — per cu-ft above allowance",
      uom: "cu-ft",
      unitPriceCents: OVERAGE_RATE,
    },
  ],
  signatory: { name: "Daniel Okonkwo", title: "Director of Supply Chain", date: "2023-08-18" },
});

// 12 months of billing: the flat base fee + a metered usage line at 9,500 cu-ft,
// but NO overage line — the 1,500 cu-ft/mo excess is never charged.
const billings = billingSeries({
  customerId: id,
  customerName: name,
  fileBase: id,
  start: "2025-07-01",
  count: 12,
  numberPrefix: "NW-GPM-2026",
  poNumber: "PO-GPM-4820",
  payment: NET30,
  lines: () => [
    bl({
      description: "Bonded warehouse storage — monthly base fee (8,000 cu-ft allowance)",
      sku: "BOND-STG",
      uom: "month",
      qty: 1,
      unitPriceCents: BASE_FEE,
      lineType: "recurring",
    }),
    bl({
      description: "Bonded storage — metered volume (cu-ft)",
      sku: "BOND-STG",
      uom: "cu-ft",
      qty: USED,
      unitPriceCents: 0, // metered reading only; consumption is bundled/over the base fee
      lineType: "usage",
    }),
  ],
});

const ar = arAging(id, [
  { invoiceNumber: "NW-GPM-2026-12", invoiceDate: "2026-06-05", ageDays: 8, balanceCents: usd(15_000) },
  { invoiceNumber: "NW-GPM-2026-11", invoiceDate: "2026-05-05", ageDays: 39, balanceCents: usd(15_000) },
]);

const record = CustomerRecordSchema.parse({
  customer: { id, name, segment, aliases: ["Granite Peak Mfg."] },
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
      ruleId: "RL05",
      category: "unbilled_usage",
      recoveryType: "arrears",
      arrearsToDateCents: 3_600_000, // $36,000.00 (12 × 1,500 cu-ft × $2.00)
      annualizedUpliftCents: 3_600_000, // $36,000.00 (1,500 cu-ft × $2.00 × 12)
      totalRecoverableCents: 7_200_000, // $72,000.00
      relationshipRisk: "A",
      note: "9,500 cu-ft/mo used vs 8,000 allowance; 1,500 cu-ft overage at $2.00 never billed for 12 months.",
    },
  ],
};

export default seed;

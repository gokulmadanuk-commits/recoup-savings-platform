/**
 * Brightline Grocers — PLANTED RL03 (expired introductory discount still applied).
 *
 * A grocery-retail-chain warehousing/distribution contract signed mid-2024 with a
 * 15% introductory discount that expired 2025-09-30. The monthly recurring gross
 * is $30,000, and every billing applies a -$4,500 discount line. The discount
 * should have stopped at expiry, but it kept being applied for the nine months
 * Oct 2025 .. Jun 2026.
 *
 *   arrears  = wrongly-given discount × 9 post-expiry months
 *            = $4,500 × 9                          = $40,500.00
 *   uplift   = monthly discount × 12 (forward run-rate gap)
 *            = $4,500 × 12                         = $54,000.00
 *   total    = $40,500 + $54,000                   = $94,500.00
 *
 * Recent and discrete (9 months, fully in-window, explicit time-box) → grade A.
 * Uplift ($54k) dominates arrears ($40.5k) → recoveryType "uplift".
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

const id = "brightline-grocers";
const name = "Brightline Grocers, LLC";

const GROSS = usd(30_000); // monthly recurring list price
const DISCOUNT = usd(4_500); // 15% of $30,000

const contract = makeCustomerContract({
  customerId: id,
  customerName: name,
  segment: "Grocery retail",
  effectiveDate: "2024-07-01",
  endDate: "2027-06-30",
  initialTermMonths: 12,
  autoRenew: true,
  noticeWindowDays: 60,
  governingLaw: "Illinois",
  auditWindowMonths: 24,
  currentAnnualValueCents: usd(360_000), // $30,000/mo gross
  payment: { netDays: 30, discountPct: 0, discountDays: 0 },
  introDiscount: { pct: 0.15, expiryDate: "2025-09-30", appliesToSku: "WHS-FEE" },
  rateCard: [
    {
      sku: "WHS-FEE",
      description: "Cold-chain warehousing & regional distribution — monthly fee",
      uom: "month",
      unitPriceCents: GROSS,
    },
  ],
  signatory: { name: "Daniel Okafor", title: "VP Supply Chain", date: "2024-06-18" },
});

// Oct 2025 .. Jun 2026 = 9 monthly billings, all dated after the 2025-09-30 expiry,
// each still carrying the -$4,500 introductory-discount line.
const billings = billingSeries({
  customerId: id,
  customerName: name,
  fileBase: id,
  start: "2025-10-01",
  count: 9,
  numberPrefix: "NW-BRG-2026",
  poNumber: "PO-BRG-4827",
  payment: { netDays: 30, discountPct: 0, discountDays: 0 },
  lines: () => [
    bl({
      description: "Cold-chain warehousing & regional distribution — monthly fee",
      sku: "WHS-FEE",
      uom: "month",
      qty: 1,
      unitPriceCents: GROSS,
      lineType: "recurring",
    }),
    bl({
      description: "Introductory discount (15%)",
      sku: "WHS-FEE",
      uom: "month",
      qty: 1,
      unitPriceCents: -DISCOUNT,
      lineTotalCents: -DISCOUNT,
      lineType: "discount",
    }),
  ],
});

const ar = arAging(id, [
  { invoiceNumber: "NW-BRG-2026-09", invoiceDate: "2026-06-05", ageDays: 7, balanceCents: usd(25_500) },
  { invoiceNumber: "NW-BRG-2026-08", invoiceDate: "2026-05-05", ageDays: 38, balanceCents: usd(25_500) },
]);

const record = CustomerRecordSchema.parse({
  customer: { id, name, segment: "Grocery retail", aliases: ["Brightline Grocers"] },
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
      ruleId: "RL03",
      category: "expired_discount",
      recoveryType: "uplift",
      arrearsToDateCents: 4_050_000, // $40,500.00 (9 × $4,500 post-expiry discount)
      annualizedUpliftCents: 5_400_000, // $54,000.00 ($4,500 × 12 forward run-rate)
      totalRecoverableCents: 9_450_000, // $94,500.00
      relationshipRisk: "A",
      note: "15% intro discount expired 2025-09-30 but still applied Oct 2025..Jun 2026.",
    },
  ],
};

export default seed;

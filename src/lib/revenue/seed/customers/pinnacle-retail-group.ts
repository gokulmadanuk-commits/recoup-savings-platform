/**
 * Pinnacle Retail Group — PLANTED RL10 (late-payment interest never charged).
 *
 * A retail fulfilment contract with a Late Payment clause entitling Northwind to
 * a 1.5%/mo finance charge on past-due balances (30-day grace). Three AR rows are
 * open: two are past due beyond grace and one is still current. No interest line
 * has ever been billed.
 *
 * Hand-computed accrual (interest = balance × 0.015 × floor(ageDays / 30)):
 *   PRG-2026-0188  $80,000 @ 75d  → floor(75/30)=2 mo  → 8,000,000 × 0.015 × 2 = 240,000c ($2,400)
 *   PRG-2026-0171  $50,000 @ 130d → floor(130/30)=4 mo → 5,000,000 × 0.015 × 4 = 300,000c ($3,000)
 *   PRG-2026-0203  $30,000 @ 12d  → 12 ≤ 30 grace      → EXCLUDED (proves the guard)
 * arrears = 240,000 + 300,000 = 540,000c ($5,400.00) ; uplift = 0 → recoveryType "arrears".
 * Recent/discrete exposure (oldest 130d ≈ 4.3 mo) → in-window, low waiver → grade A.
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

const id = "pinnacle-retail-group";
const name = "Pinnacle Retail Group, Inc.";

const contract = makeCustomerContract({
  customerId: id,
  customerName: name,
  segment: "Retail",
  effectiveDate: "2023-03-01",
  endDate: "2027-02-28",
  initialTermMonths: 12,
  autoRenew: true,
  noticeWindowDays: 60,
  governingLaw: "Illinois",
  auditWindowMonths: 24,
  currentAnnualValueCents: usd(360_000),
  payment: NET30,
  latePaymentInterestPct: 0.015, // 1.5%/mo finance charge on past-due balances
  rateCard: [
    {
      sku: "RETAIL-FULFILL",
      description: "Retail e-commerce fulfilment — monthly service fee",
      uom: "month",
      unitPriceCents: usd(30_000),
    },
  ],
  signatory: { name: "Daniel Reyes", title: "VP Supply Chain", date: "2023-02-15" },
});

const billings = billingSeries({
  customerId: id,
  customerName: name,
  fileBase: id,
  start: "2025-07-01",
  count: 12,
  numberPrefix: "NW-PRG-2026",
  poNumber: "PO-PRG-7740",
  payment: NET30,
  lines: () => [
    bl({
      description: "Retail e-commerce fulfilment — monthly service fee",
      sku: "RETAIL-FULFILL",
      uom: "month",
      qty: 1,
      unitPriceCents: usd(30_000),
      lineType: "recurring",
    }),
  ],
});

const ar = arAging(id, [
  // Past due beyond grace → accrues interest.
  { invoiceNumber: "PRG-2026-0188", invoiceDate: "2026-04-10", ageDays: 75, balanceCents: usd(80_000) },
  { invoiceNumber: "PRG-2026-0171", invoiceDate: "2026-02-12", ageDays: 130, balanceCents: usd(50_000) },
  // Current (within 30-day grace) → excluded; proves the guard.
  { invoiceNumber: "PRG-2026-0203", invoiceDate: "2026-06-15", ageDays: 12, balanceCents: usd(30_000) },
]);

const record = CustomerRecordSchema.parse({
  customer: { id, name, segment: "Retail", aliases: ["Pinnacle Retail Grp."] },
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
      ruleId: "RL10",
      category: "late_interest",
      recoveryType: "arrears",
      arrearsToDateCents: 540_000, // $5,400.00 = $2,400 (80k@75d) + $3,000 (50k@130d)
      annualizedUpliftCents: 0,
      totalRecoverableCents: 540_000,
      relationshipRisk: "A",
      note: "1.5%/mo finance charge never billed; $80k@75d + $50k@130d past due, current row excluded.",
    },
  ],
};

export default seed;

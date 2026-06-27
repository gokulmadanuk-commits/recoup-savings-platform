/**
 * Keystone Mutual Insurance — CGL + property package, annual premium billed in
 * monthly installments. Planted finding:
 *   R04 above-market renewal: prior-year monthly premium of $10,000 jumps +22%
 *       to $12,200 at the renewal anniversary (fixed escalator 22%, far above
 *       the 8% above-market threshold and the fair 3-5% band). The history spans
 *       the anniversary (14 months) so the YoY jump is visible. Challengeable =
 *       the annualized over-market uplift = ($12,200 - $10,000) x 12 = $26,400/yr.
 */
import { VendorRecordSchema } from "../../types";
import { slug } from "../../docmodel/serialize";
import { usd, makeContract, invoiceSeries, li, NET30 } from "../helpers";
import type { VendorSeed } from "../types";

const name = "Keystone Mutual Insurance";
const id = slug(name);
const category = "Insurance";

const priorMonthly = usd(10_000); // $120,000/yr prior premium
const renewedMonthly = usd(12_200); // +22% at renewal -> $146,400/yr

// Anniversary at month 1 (January): months indexed 0..7 are pre-renewal
// (2025-05..2025-12), 8..13 are post-renewal (2026-01..2026-06).
const ANNIVERSARY_INDEX = 8;

const contract = makeContract({
  vendorName: name,
  category,
  effectiveDate: "2024-01-01",
  endDate: "2027-12-31", // multi-year term -> R01 does NOT fire (daysToRenewal > 90)
  initialTermMonths: 48,
  autoRenew: true,
  noticeWindowDays: 60,
  governingLaw: "Ohio",
  currentAnnualValueCents: usd(146_400),
  payment: NET30,
  escalator: { type: "fixed", fixedPct: 0.22, capPct: null, anniversaryMonth: 1 },
  capabilityTags: ["Commercial General Liability", "Property"],
  signatory: { name: "Helen Vasquez", title: "Risk Manager", date: "2023-12-12" },
});

const series = invoiceSeries({
  vendorId: id,
  vendorName: name,
  fileBase: id,
  start: "2025-05-01",
  count: 14,
  numberPrefix: "KMI-INV",
  poNumber: "PO-NW-1310",
  payment: NET30,
  ein: "31-4471920",
  lines: (m) => {
    const monthly = m.index >= ANNIVERSARY_INDEX ? renewedMonthly : priorMonthly;
    return [
      li({
        description: "CGL + Property Package Premium (monthly installment)",
        sku: "PKG-CGL-PROP",
        uom: "month",
        qty: 1,
        unitPriceCents: monthly,
        lineType: "recurring",
      }),
    ];
  },
});

const record = VendorRecordSchema.parse({
  vendor: { id, name, category, aliases: ["Keystone Mutual Insurance Company"] },
  contract,
  invoices: series,
  usage: [],
});

// Above-market uplift annualized: the +22% jump exceeds the fair 3-5% band, so
// the entire YoY delta is challengeable at the renewal.
const monthlyUplift = renewedMonthly - priorMonthly; // 220000 cents
const seed: VendorSeed = {
  record,
  expected: [
    {
      vendorId: id,
      ruleId: "R04",
      category: "price_escalator",
      savingsType: "avoidance",
      annualizedSavingsCents: monthlyUplift * 12, // $26,400/yr
      note: "Renewal premium +22% ($10,000 -> $12,200/mo), above the 8% threshold and fair 3-5% band; annualized over-market uplift",
    },
  ],
};

export default seed;

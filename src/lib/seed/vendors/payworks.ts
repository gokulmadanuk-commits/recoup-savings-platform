/**
 * PayWorks HCM — payroll + HRIS, base platform fee + PEPM. Planted finding:
 *   R01 auto-renewal: the agreement auto-renews in 45 days (endDate 2026-08-11,
 *       30-day notice window) at a +18% PEPM uplift. With 600 employees at
 *       $24.00 PEPM ($14,400/mo), the 18% uplift is $172,800 * 0.18 = $31,104
 *       of annual increase at risk if the notice window is missed. A
 *       termination-fee trap ($45,000) deepens the lock-in.
 *
 * 12 monthly invoices (Jul 2025 - Jun 2026). This is the R01 target vendor, so
 * the renewal window is deliberately inside 90 days.
 */
import { VendorRecordSchema } from "../../types";
import { slug } from "../../docmodel/serialize";
import { usd, makeContract, invoiceSeries, li, NET30 } from "../helpers";
import type { VendorSeed } from "../types";

const name = "PayWorks HCM";
const id = slug(name);
const category = "Payroll/HR software";

const EMPLOYEES = 600;
const PEPM_RATE = usd(24); // $24.00/employee/mo
const BASE_FEE = usd(1_500); // $1,500/mo platform base fee
const PEPM_MONTHLY = PEPM_RATE * EMPLOYEES; // $14,400/mo
const RENEWAL_UPLIFT_PCT = 0.18;

const contract = makeContract({
  vendorName: name,
  category,
  effectiveDate: "2025-08-12",
  endDate: "2026-08-11",
  initialTermMonths: 12,
  autoRenew: true,
  noticeWindowDays: 30,
  renewalTermMonths: 12,
  earlyTermFeeCents: usd(45_000), // termination-fee trap
  governingLaw: "Texas",
  currentAnnualValueCents: (BASE_FEE + PEPM_MONTHLY) * 12,
  payment: NET30,
  rateCard: [
    { sku: "HCM-BASE", description: "HCM Platform Base Fee", uom: "month", unitPriceCents: BASE_FEE },
    { sku: "HCM-PEPM", description: "Payroll + HRIS (per employee per month)", uom: "employee", unitPriceCents: PEPM_RATE },
  ],
  pepmRateCents: PEPM_RATE,
  // The renewal escalates the contract +18%; R01 reads this to size the uplift.
  escalator: { type: "fixed", fixedPct: RENEWAL_UPLIFT_PCT, anniversaryMonth: 8 },
  capabilityTags: ["Payroll", "HRIS"],
  signatory: { name: "Devon Carr", title: "VP People Operations", date: "2025-08-01" },
});

const series = invoiceSeries({
  vendorId: id,
  vendorName: name,
  fileBase: id,
  start: "2025-07-01",
  count: 12,
  numberPrefix: "PW-INV",
  poNumber: "PO-NW-1377",
  payment: NET30,
  ein: "75-2290144",
  lines: () => [
    li({ description: "HCM Platform Base Fee", sku: "HCM-BASE", uom: "month", qty: 1, unitPriceCents: BASE_FEE, lineType: "recurring" }),
    li({ description: "Payroll + HRIS (per employee per month)", sku: "HCM-PEPM", uom: "employee", qty: EMPLOYEES, unitPriceCents: PEPM_RATE, lineType: "recurring" }),
  ],
});

const record = VendorRecordSchema.parse({
  vendor: { id, name, category, aliases: ["PayWorks HCM Inc.", "PayWorks Human Capital Management"] },
  contract,
  invoices: series,
  usage: [],
});

// R01 savings = the negotiable +18% renewal uplift on the annual contract value
// (the increase you challenge by acting on the 30-day window). The full
// post-renewal value is the "at risk" context. (BASE+PEPM)*12 = $190,800;
// uplift = round(190,800 * 1.18) - 190,800 = 34,344.
const CURRENT_ANNUAL = (BASE_FEE + PEPM_MONTHLY) * 12; // 19,080,000 = $190,800
const r01Annual = Math.round(CURRENT_ANNUAL * (1 + RENEWAL_UPLIFT_PCT)) - CURRENT_ANNUAL; // 3,434,400

const seed: VendorSeed = {
  record,
  expected: [
    {
      vendorId: id,
      ruleId: "R01",
      category: "auto_renewal",
      savingsType: "avoidance",
      annualizedSavingsCents: r01Annual,
      note: "Auto-renews in 45 days (30-day notice) at +18% on $190,800 => $34,344/yr negotiable uplift; $45,000 termination-fee trap deepens the lock-in.",
    },
  ],
};

export default seed;

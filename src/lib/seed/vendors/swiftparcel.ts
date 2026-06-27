/**
 * SwiftParcel Express — parcel/courier, GRI + fuel surcharge + accessorials.
 * Planted finding:
 *   R04 escalator breach: the contract locks the annual General Rate Increase
 *       (GRI) to a fixed 5.9% with a 5.9% cap, but the vendor applied a 7.5%
 *       GRI to the base transportation charge at the anniversary. The invoice
 *       series spans the May anniversary so the YoY jump is visible:
 *         prior base  $112,000/mo  ($1,344,000/yr)
 *         applied     $120,400/mo  (= +7.5%)
 *         cap-allowed $118,608/mo  (= +5.9%)
 *       over-uplift   $1,792/mo  => $21,504/yr challengeable (breach of cap).
 */
import { VendorRecordSchema } from "../../types";
import { slug } from "../../docmodel/serialize";
import { usd, makeContract, invoiceSeries, li, NET30, type MonthCtx } from "../helpers";
import type { VendorSeed } from "../types";

const name = "SwiftParcel Express";
const id = slug(name);
const category = "Logistics/courier";

const BASE_PRIOR = usd(112_000); // monthly base transportation charge pre-anniversary
const APPLIED_PCT = 7.5 / 100; // GRI the vendor actually applied (round-trips as 7.5%)
const ALLOWED_PCT = 5.9 / 100; // contract fixed escalator + cap (round-trips as 5.9%)
const BASE_APPLIED = usd(112_000 * (1 + APPLIED_PCT)); // 12,040,000 cents = $120,400.00
const BASE_ALLOWED = usd(112_000 * (1 + ALLOWED_PCT)); // 11,860,800 cents = $118,608.00
const ANNIVERSARY_INDEX = 12; // months 0-11 = prior period; 12+ = post-anniversary

const FUEL_SURCHARGE = usd(8_400); // flat monthly fuel surcharge (not a finding)

const contract = makeContract({
  vendorName: name,
  category,
  effectiveDate: "2024-05-01",
  endDate: "2028-04-30", // multi-year term => R01 must NOT fire
  initialTermMonths: 48,
  autoRenew: true,
  noticeWindowDays: 60,
  governingLaw: "Ohio",
  currentAnnualValueCents: usd(1_344_000),
  payment: NET30,
  rateCard: [
    { sku: "GRI-BASE", description: "Base Transportation Charge (monthly)", uom: "month", unitPriceCents: BASE_PRIOR },
    { sku: "FUEL-SUR", description: "Fuel Surcharge", uom: "month", unitPriceCents: FUEL_SURCHARGE },
  ],
  // Fixed 5.9% annual GRI, capped at 5.9%, anniversary in May.
  escalator: { type: "fixed", fixedPct: ALLOWED_PCT, capPct: ALLOWED_PCT, anniversaryMonth: 5 },
  capabilityTags: ["Parcel", "Courier", "Overnight"],
  signatory: { name: "Marcus Bell", title: "VP Logistics", date: "2024-04-10" },
});

const baseForMonth = (m: MonthCtx) =>
  m.index >= ANNIVERSARY_INDEX ? BASE_APPLIED : BASE_PRIOR;

const series = invoiceSeries({
  vendorId: id,
  vendorName: name,
  fileBase: id,
  start: "2025-05-01",
  count: 14, // May 2025 .. Jun 2026 — spans the May 2026 anniversary
  numberPrefix: "SP-INV",
  poNumber: "PO-NW-1355",
  payment: NET30,
  taxRate: 0,
  ein: "45-6612097",
  lines: (m) => [
    li({
      description: "Base Transportation Charge",
      sku: "GRI-BASE",
      uom: "month",
      qty: 1,
      unitPriceCents: baseForMonth(m),
      lineType: "recurring",
    }),
    li({
      description: "Fuel Surcharge",
      sku: "FUEL-SUR",
      uom: "month",
      qty: 1,
      unitPriceCents: FUEL_SURCHARGE,
      lineType: "accessorial",
    }),
  ],
});

const record = VendorRecordSchema.parse({
  vendor: { id, name, category, aliases: ["SwiftParcel Express, Inc.", "SwiftParcel Logistics"] },
  contract,
  invoices: series,
  usage: [],
});

// Over-uplift vs the contractual 5.9% cap.
const overUpliftPerMonth = BASE_APPLIED - BASE_ALLOWED; // 179,200 cents = $1,792.00
const postAnniversaryMonths = 14 - ANNIVERSARY_INDEX; // 2 months billed at the bad rate so far
const seed: VendorSeed = {
  record,
  expected: [
    {
      vendorId: id,
      ruleId: "R04",
      category: "price_escalator",
      savingsType: "recovery",
      annualizedSavingsCents: overUpliftPerMonth * 12, // 2,150,400 = $21,504/yr
      recoverableToDateCents: overUpliftPerMonth * postAnniversaryMonths, // 358,400 = $3,584
      note: "Vendor applied a 7.5% GRI to the base transportation charge vs the contract's fixed 5.9% cap; over-uplift $1,792/mo => $21,504/yr",
    },
  ],
};

export default seed;

/**
 * RedShield Cyber — managed SOC/MDR monthly subscription. Planted finding:
 *   R13 cross-vendor redundancy: capabilityTags include "Managed Detection &
 *       Response (MDR)", which overlaps with AtlasCloud's bundled security
 *       add-on. The standalone RedShield subscription (~$28K/yr) is the
 *       eliminable, redundant tool => avoidance at non-renewal.
 *
 * Non-R01: term runs to 2027-12-31 (well beyond the 90-day window) so the
 * auto-renewal rule does NOT fire on this vendor.
 */
import { VendorRecordSchema } from "../../types";
import { slug } from "../../docmodel/serialize";
import { usd, makeContract, invoiceSeries, li, NET30 } from "../helpers";
import type { VendorSeed } from "../types";

const name = "RedShield Cyber";
const id = slug(name);
const category = "Security (cyber)";

// $2,333.33/mo managed SOC/MDR subscription.
const monthlyCents = usd(2_333.33);

const contract = makeContract({
  vendorName: name,
  category,
  effectiveDate: "2025-01-01",
  endDate: "2027-12-31",
  initialTermMonths: 36,
  autoRenew: true,
  noticeWindowDays: 60,
  governingLaw: "New York",
  currentAnnualValueCents: monthlyCents * 12,
  payment: NET30,
  rateCard: [
    {
      sku: "MDR-SUB",
      description: "Managed Detection & Response (MDR) — 24x7 SOC",
      uom: "month",
      unitPriceCents: monthlyCents,
    },
  ],
  // EXACT overlap string with AtlasCloud's security add-on (do not reword).
  capabilityTags: ["Managed Detection & Response (MDR)", "SIEM", "Threat Intelligence"],
  signatory: { name: "Priya Nair", title: "CISO", date: "2024-12-20" },
});

const series = invoiceSeries({
  vendorId: id,
  vendorName: name,
  fileBase: id,
  start: "2025-07-01",
  count: 12,
  numberPrefix: "RS-INV",
  poNumber: "PO-NW-1305",
  payment: NET30,
  ein: "27-5512098",
  lines: () => [
    li({
      description: "Managed Detection & Response (MDR) — 24x7 SOC",
      sku: "MDR-SUB",
      uom: "month",
      qty: 1,
      unitPriceCents: monthlyCents,
      lineType: "recurring",
    }),
  ],
});

const record = VendorRecordSchema.parse({
  vendor: { id, name, category, aliases: ["RedShield Cyber, Inc.", "RedShield Security LLC"] },
  contract,
  invoices: series,
  usage: [],
});

// R13 avoidance = annual cost of the eliminable, redundant subscription.
const annualAvoidance = monthlyCents * 12; // $27,999.96

const seed: VendorSeed = {
  record,
  expected: [
    {
      vendorId: id,
      ruleId: "R13",
      category: "tier_optimization",
      savingsType: "avoidance",
      annualizedSavingsCents: annualAvoidance,
      note: "Standalone MDR subscription overlaps AtlasCloud bundled security add-on; eliminate redundant $2,333.33/mo subscription",
    },
  ],
};

export default seed;

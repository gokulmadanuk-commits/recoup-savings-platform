/**
 * Summit Copier Leasing — MFP/copier fleet lease + per-click charges. Two
 * planted findings:
 *   R02 rate mismatch: color clicks billed at $105.00 / 1,000 ($0.105/click)
 *       vs the contracted CLICK-COLOR rate of $85.00 / 1,000 ($0.085/click).
 *       40,000 color clicks/mo => $20.00/1,000 * 40 * 12 = $9,600/yr.
 *   R11 ghost units: 2 copier units physically returned (UsageRecord kind
 *       "unit", status "returned") yet still billed the $285.00/mo lease =>
 *       2 * $285 * 12 = $6,840/yr.
 *   Combined: $16,440/yr.
 *
 * Click rates are expressed PER 1,000 clicks so all unit prices stay whole
 * cents and survive the document round-trip (sub-cent prices would not).
 *
 * Non-R01: lease term runs to 2028-06-30 so R01 does NOT fire.
 */
import { VendorRecordSchema } from "../../types";
import { slug } from "../../docmodel/serialize";
import type { UsageRecord } from "../../types";
import { usd, makeContract, invoiceSeries, li, NET30 } from "../helpers";
import type { VendorSeed } from "../types";

const name = "Summit Copier Leasing";
const id = slug(name);
const category = "Equipment lease";

const ACTIVE_UNITS = 6; // copiers actually deployed
const GHOST_UNITS = 2; // returned units still billed
const BILLED_UNITS = ACTIVE_UNITS + GHOST_UNITS; // 8 still on the invoice
const LEASE_PER_UNIT = usd(285); // $285.00/unit/mo

// Per-1,000-click pricing keeps unit prices whole-cent.
const CLICK_COLOR_CONTRACT = usd(85); // $85.00 / 1,000 color clicks ($0.085)
const CLICK_COLOR_INVOICED = usd(105); // $105.00 / 1,000 color clicks ($0.105)
const CLICK_MONO_RATE = usd(9); // $9.00 / 1,000 mono clicks (no dispute)
const COLOR_KCLICKS = 40; // 40,000 color clicks/mo => 40 units of 1,000
const MONO_KCLICKS = 120; // 120,000 mono clicks/mo

const contract = makeContract({
  vendorName: name,
  category,
  effectiveDate: "2025-01-01",
  endDate: "2028-06-30",
  initialTermMonths: 42,
  autoRenew: true,
  noticeWindowDays: 60,
  governingLaw: "Ohio",
  currentAnnualValueCents:
    (ACTIVE_UNITS * LEASE_PER_UNIT +
      COLOR_KCLICKS * CLICK_COLOR_CONTRACT +
      MONO_KCLICKS * CLICK_MONO_RATE) *
    12,
  payment: NET30,
  rateCard: [
    { sku: "MFP-LEASE", description: "MFP/Copier Monthly Lease (per unit)", uom: "unit", unitPriceCents: LEASE_PER_UNIT },
    { sku: "CLICK-COLOR", description: "Color Clicks (per 1,000)", uom: "1000-clicks", unitPriceCents: CLICK_COLOR_CONTRACT },
    { sku: "CLICK-MONO", description: "Monochrome Clicks (per 1,000)", uom: "1000-clicks", unitPriceCents: CLICK_MONO_RATE },
  ],
  signatory: { name: "Gregory Holt", title: "Facilities Director", date: "2024-12-15" },
});

const series = invoiceSeries({
  vendorId: id,
  vendorName: name,
  fileBase: id,
  start: "2025-07-01",
  count: 12,
  numberPrefix: "SC-INV",
  poNumber: "PO-NW-1411",
  payment: NET30,
  taxRate: 0.08,
  ein: "31-7745120",
  lines: () => [
    // 8 units billed (6 active + 2 returned ghosts).
    li({ description: "MFP/Copier Monthly Lease", sku: "MFP-LEASE", uom: "unit", qty: BILLED_UNITS, unitPriceCents: LEASE_PER_UNIT, lineType: "recurring" }),
    // Color clicks billed at the inflated $105/1,000 vs $85/1,000 contracted.
    li({ description: "Color Clicks (per 1,000)", sku: "CLICK-COLOR", uom: "1000-clicks", qty: COLOR_KCLICKS, unitPriceCents: CLICK_COLOR_INVOICED, lineType: "usage" }),
    li({ description: "Monochrome Clicks (per 1,000)", sku: "CLICK-MONO", uom: "1000-clicks", qty: MONO_KCLICKS, unitPriceCents: CLICK_MONO_RATE, lineType: "usage" }),
  ],
});

// Asset inventory: 6 active units, 2 returned (still billed) => ghost units.
const usage: UsageRecord[] = [];
for (let i = 0; i < ACTIVE_UNITS; i++) {
  usage.push({
    vendorId: id,
    kind: "unit",
    identifier: `COPIER-${String(i + 1).padStart(3, "0")}`,
    status: "active",
    lastActiveDate: "2026-06-20",
    provisioned: true,
    feature: null,
    used: null,
    tier: null,
    period: null,
    count: null,
    decommissionDate: null,
  });
}
for (let i = 0; i < GHOST_UNITS; i++) {
  usage.push({
    vendorId: id,
    kind: "unit",
    identifier: `COPIER-${String(ACTIVE_UNITS + i + 1).padStart(3, "0")}`,
    status: "returned",
    lastActiveDate: "2025-12-31",
    provisioned: false,
    feature: null,
    used: null,
    tier: null,
    period: null,
    count: null,
    decommissionDate: "2025-12-31",
  });
}

const record = VendorRecordSchema.parse({
  vendor: { id, name, category, aliases: ["Summit Copier Leasing Co.", "Summit Office Imaging"] },
  contract,
  invoices: series,
  usage,
});

// R02: ($105 - $85) per 1,000 * 40 (thousand-clicks) * 12 months.
const r02Annual = (CLICK_COLOR_INVOICED - CLICK_COLOR_CONTRACT) * COLOR_KCLICKS * 12; // 960000
// R11: 2 ghost units * $285/mo * 12 months.
const r11Annual = GHOST_UNITS * LEASE_PER_UNIT * 12; // 684000

const seed: VendorSeed = {
  record,
  expected: [
    {
      vendorId: id,
      ruleId: "R02",
      category: "rate_mismatch",
      savingsType: "recovery",
      annualizedSavingsCents: r02Annual,
      recoverableToDateCents: r02Annual,
      note: "Color clicks billed $105.00/1,000 vs $85.00/1,000 contracted; 40,000 clicks/mo over 12 months",
    },
    {
      vendorId: id,
      ruleId: "R11",
      category: "overbilling",
      savingsType: "recovery",
      annualizedSavingsCents: r11Annual,
      recoverableToDateCents: r11Annual,
      note: "2 returned copier units still billed $285.00/mo lease over 12 months",
    },
  ],
};

export default seed;

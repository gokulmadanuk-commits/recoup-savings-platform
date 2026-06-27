/**
 * ClearWave Mobile — corporate wireless fleet, per-line plans. Planted finding:
 *   R11 zero-usage lines: 18 wireless lines billed $42/mo each have had zero
 *       usage for 3+ months (inactive in the line inventory) yet keep billing.
 *       => 18 x $42 x 12 = $9,072/yr recoverable.
 */
import { VendorRecordSchema, type UsageRecord } from "../../types";
import { slug } from "../../docmodel/serialize";
import { usd, makeContract, invoiceSeries, li, NET30 } from "../helpers";
import type { VendorSeed } from "../types";

const name = "ClearWave Mobile";
const id = slug(name);
const category = "Telecom (wireless)";

const LINE_MRC = usd(42); // 4200 cents per line per month
const ACTIVE_LINES = 132; // live handsets, billed and used — not a finding
const ZOMBIE_LINES = 18; // zero usage 3+ months, still billed

// Wireless line numbers for the inactive fleet (assetId per line).
const inactiveLineIds = Array.from(
  { length: ZOMBIE_LINES },
  (_, i) => `LN-614${String(200 + i).padStart(3, "0")}`,
);

const contract = makeContract({
  vendorName: name,
  category,
  effectiveDate: "2024-11-01",
  endDate: "2027-10-31", // multi-year term => R01 must NOT fire
  initialTermMonths: 36,
  autoRenew: true,
  noticeWindowDays: 30,
  governingLaw: "Ohio",
  currentAnnualValueCents: usd(75_600),
  payment: NET30,
  rateCard: [
    { sku: "WL-UNL", description: "Unlimited Voice/Data Line", uom: "line", unitPriceCents: usd(42) },
  ],
  capabilityTags: ["Wireless", "Mobility"],
  signatory: { name: "Devon Brooks", title: "Telecom Manager", date: "2024-10-15" },
});

const series = invoiceSeries({
  vendorId: id,
  vendorName: name,
  fileBase: id,
  start: "2025-07-01",
  count: 12,
  numberPrefix: "CW-INV",
  poNumber: "PO-NW-1322",
  payment: NET30,
  taxRate: 0,
  ein: "27-7741098",
  lines: () => [
    // Active fleet — billed as a single pooled recurring line (legitimate spend).
    li({
      description: "Unlimited Voice/Data Lines — active fleet",
      sku: "WL-UNL",
      uom: "line",
      qty: ACTIVE_LINES,
      unitPriceCents: LINE_MRC,
      lineType: "recurring",
    }),
    // The 18 zero-usage lines, billed individually with their line id (assetId).
    ...inactiveLineIds.map((ln) =>
      li({
        description: `Unlimited Voice/Data Line — ${ln}`,
        sku: "WL-UNL",
        uom: "line",
        qty: 1,
        unitPriceCents: LINE_MRC,
        lineType: "recurring",
        assetId: ln,
      }),
    ),
  ],
});

// Line inventory: active fleet (representative active record) + 18 inactive lines.
const usage: UsageRecord[] = [
  {
    vendorId: id,
    kind: "line",
    identifier: "POOL-ACTIVE",
    status: "active",
    lastActiveDate: "2026-06-22",
    provisioned: true,
    feature: null,
    used: true,
    tier: null,
    period: null,
    count: ACTIVE_LINES,
    decommissionDate: null,
  },
  ...inactiveLineIds.map((ln) => ({
    vendorId: id,
    kind: "line" as const,
    identifier: ln,
    status: "inactive" as const,
    lastActiveDate: "2026-02-10", // last activity > 3 months before 2026-06-27
    provisioned: true,
    feature: null,
    used: false,
    tier: null,
    period: null,
    count: 0,
    decommissionDate: null,
  })),
];

const record = VendorRecordSchema.parse({
  vendor: { id, name, category, aliases: ["ClearWave Mobile Inc.", "ClearWave Wireless"] },
  contract,
  invoices: series,
  usage,
});

const seed: VendorSeed = {
  record,
  expected: [
    {
      vendorId: id,
      ruleId: "R11",
      category: "overbilling",
      savingsType: "recovery",
      annualizedSavingsCents: ZOMBIE_LINES * LINE_MRC * 12, // 18 * 4200 * 12 = 907,200
      recoverableToDateCents: ZOMBIE_LINES * LINE_MRC * 12, // 907,200
      note: "18 wireless lines with zero usage 3+ months still billed at $42/mo each",
    },
  ],
};

export default seed;

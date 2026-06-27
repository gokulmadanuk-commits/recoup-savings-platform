/**
 * Cascade Power & Water — utilities, metered usage. Planted finding:
 *   R11 zombie meter: a closed location's electric meter (MTR-DET-07) is still
 *       billed every month — both its base metered charge ($525/mo) AND a
 *       demand-charge tier error ($250/mo applied at the wrong demand band) —
 *       even though the meter was decommissioned 2025-06-15. The meter
 *       inventory (UsageRecord kind "meter") shows it decommissioned.
 *       => ($525 + $250) x 12 = $9,300/yr recoverable.
 */
import { VendorRecordSchema, type UsageRecord } from "../../types";
import { slug } from "../../docmodel/serialize";
import { usd, makeContract, invoiceSeries, li, NET30 } from "../helpers";
import type { VendorSeed } from "../types";

const name = "Cascade Power & Water";
const id = slug(name);
const category = "Utilities";

// Active site meters (legitimate metered usage).
const ACTIVE_METERS = [
  { asset: "MTR-COL-01", site: "Columbus HQ", base: usd(2_140) },
  { asset: "MTR-CIN-03", site: "Cincinnati DC", base: usd(1_780) },
  { asset: "MTR-CLE-05", site: "Cleveland Ops", base: usd(1_390) },
];
// The zombie: Detroit site meter, closed 2025-06-15 but still billing.
const ZOMBIE = {
  asset: "MTR-DET-07",
  site: "Detroit Branch (closed)",
  base: usd(525), // closed-location base metered charge
  demand: usd(250), // demand-charge tier error on the same closed meter
};

const contract = makeContract({
  vendorName: name,
  category,
  effectiveDate: "2024-01-01",
  endDate: "2027-12-31", // long utility term => R01 must NOT fire
  initialTermMonths: 48,
  autoRenew: true,
  noticeWindowDays: 30,
  governingLaw: "Ohio",
  currentAnnualValueCents: usd(92_400),
  payment: NET30,
  rateCard: [
    { sku: "ELEC-KWH", description: "Electricity — metered kWh (base)", uom: "meter", unitPriceCents: usd(525) },
    { sku: "DEMAND-KW", description: "Demand Charge per kW (Tier 1)", uom: "kW", unitPriceCents: usd(12) },
  ],
  capabilityTags: ["Electricity", "Water", "Gas"],
  signatory: { name: "Lena Hoffmann", title: "Facilities Director", date: "2023-12-10" },
});

const series = invoiceSeries({
  vendorId: id,
  vendorName: name,
  fileBase: id,
  start: "2025-07-01",
  count: 12,
  numberPrefix: "CPW-INV",
  poNumber: "PO-NW-1340",
  payment: NET30,
  taxRate: 0,
  ein: "31-2208845",
  lines: () => [
    ...ACTIVE_METERS.map((m) =>
      li({
        description: `Metered Service — ${m.site} (${m.asset})`,
        sku: "ELEC-KWH",
        uom: "meter",
        qty: 1,
        unitPriceCents: m.base,
        lineType: "recurring",
        assetId: m.asset,
      }),
    ),
    // Zombie closed-location meter: base metered charge.
    li({
      description: `Metered Service — ${ZOMBIE.site} (${ZOMBIE.asset})`,
      sku: "ELEC-KWH",
      uom: "meter",
      qty: 1,
      unitPriceCents: ZOMBIE.base,
      lineType: "recurring",
      assetId: ZOMBIE.asset,
    }),
    // Zombie closed-location meter: demand-charge tier error (same asset).
    li({
      description: `Demand Charge (mis-tiered) — ${ZOMBIE.site} (${ZOMBIE.asset})`,
      sku: "DEMAND-KW",
      uom: "kW",
      qty: 1,
      unitPriceCents: ZOMBIE.demand,
      lineType: "recurring",
      assetId: ZOMBIE.asset,
    }),
  ],
});

// Meter inventory: active meters + the decommissioned Detroit meter.
const usage: UsageRecord[] = [
  ...ACTIVE_METERS.map((m) => ({
    vendorId: id,
    kind: "meter" as const,
    identifier: m.asset,
    status: "active" as const,
    lastActiveDate: "2026-06-18",
    provisioned: true,
    feature: null,
    used: null,
    tier: null,
    period: null,
    count: null,
    decommissionDate: null,
  })),
  {
    vendorId: id,
    kind: "meter",
    identifier: ZOMBIE.asset,
    status: "decommissioned",
    lastActiveDate: "2025-06-15",
    provisioned: false,
    feature: null,
    used: null,
    tier: null,
    period: null,
    count: null,
    decommissionDate: "2025-06-15",
  },
];

const record = VendorRecordSchema.parse({
  vendor: { id, name, category, aliases: ["Cascade Power & Water Co.", "Cascade Utilities"] },
  contract,
  invoices: series,
  usage,
});

// Closed-location meter waste: base $525 + demand-tier error $250 = $775/mo.
const monthlyWaste = ZOMBIE.base + ZOMBIE.demand; // 77500 cents
const seed: VendorSeed = {
  record,
  expected: [
    {
      vendorId: id,
      ruleId: "R11",
      category: "overbilling",
      savingsType: "recovery",
      annualizedSavingsCents: monthlyWaste * 12, // 930,000
      recoverableToDateCents: monthlyWaste * 12, // 930,000
      note: "Closed Detroit meter MTR-DET-07 still billed $525/mo base plus a $250/mo demand-charge tier error for 12 months",
    },
  ],
};

export default seed;

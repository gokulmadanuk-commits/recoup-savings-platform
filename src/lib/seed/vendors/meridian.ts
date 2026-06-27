/**
 * Meridian Telecom — multi-site SD-WAN + voice, MRC per circuit. Planted finding:
 *   R11 zombie line: a decommissioned Detroit-site circuit (CKT-4417) keeps
 *       billing its $1,250/mo MRC for all 12 months after the site closed. The
 *       circuit inventory (UsageRecord kind "circuit") shows it decommissioned
 *       before the billing window => $15,000/yr recoverable.
 */
import { VendorRecordSchema, type UsageRecord } from "../../types";
import { slug } from "../../docmodel/serialize";
import { usd, makeContract, invoiceSeries, li, NET30 } from "../helpers";
import type { VendorSeed } from "../types";

const name = "Meridian Telecom";
const id = slug(name);
const category = "Telecom/connectivity";

// Active SD-WAN circuits (one per live site) plus the decommissioned Detroit one.
const ACTIVE_CIRCUITS = [
  { asset: "CKT-1001", site: "Columbus HQ", mrc: usd(1_450) },
  { asset: "CKT-1002", site: "Cincinnati DC", mrc: usd(1_250) },
  { asset: "CKT-1003", site: "Cleveland Ops", mrc: usd(1_100) },
  { asset: "CKT-1004", site: "Indianapolis Hub", mrc: usd(1_350) },
];
// The zombie: Detroit site closed 2025-05-30 but the circuit still bills.
const ZOMBIE = { asset: "CKT-4417", site: "Detroit Branch (closed)", mrc: usd(1_250) };

const contract = makeContract({
  vendorName: name,
  category,
  effectiveDate: "2024-09-01",
  endDate: "2027-08-31", // multi-year term => R01 must NOT fire
  initialTermMonths: 36,
  autoRenew: true,
  noticeWindowDays: 60,
  governingLaw: "Ohio",
  currentAnnualValueCents: usd(75_000),
  payment: NET30,
  rateCard: [
    { sku: "SDWAN-MRC", description: "SD-WAN Circuit Monthly Recurring Charge", uom: "circuit", unitPriceCents: usd(1_250) },
    { sku: "VOICE-SIP", description: "SIP Trunk Voice Channel", uom: "channel", unitPriceCents: usd(25) },
  ],
  capabilityTags: ["SD-WAN", "Voice", "Connectivity"],
  signatory: { name: "Priya Raman", title: "Director of Network Ops", date: "2024-08-12" },
});

const series = invoiceSeries({
  vendorId: id,
  vendorName: name,
  fileBase: id,
  start: "2025-07-01",
  count: 12,
  numberPrefix: "MT-INV",
  poNumber: "PO-NW-1311",
  payment: NET30,
  taxRate: 0,
  ein: "38-5567120",
  lines: () => [
    ...ACTIVE_CIRCUITS.map((c) =>
      li({
        description: `SD-WAN MRC — ${c.site} (${c.asset})`,
        sku: "SDWAN-MRC",
        uom: "circuit",
        qty: 1,
        unitPriceCents: c.mrc,
        lineType: "recurring",
        assetId: c.asset,
      }),
    ),
    li({
      description: `SD-WAN MRC — ${ZOMBIE.site} (${ZOMBIE.asset})`,
      sku: "SDWAN-MRC",
      uom: "circuit",
      qty: 1,
      unitPriceCents: ZOMBIE.mrc,
      lineType: "recurring",
      assetId: ZOMBIE.asset,
    }),
    li({
      description: "SIP Trunk Voice Channels",
      sku: "VOICE-SIP",
      uom: "channel",
      qty: 48,
      unitPriceCents: usd(25),
      lineType: "recurring",
    }),
  ],
});

// Circuit inventory: active circuits + the decommissioned Detroit circuit.
const usage: UsageRecord[] = [
  ...ACTIVE_CIRCUITS.map((c) => ({
    vendorId: id,
    kind: "circuit" as const,
    identifier: c.asset,
    status: "active" as const,
    lastActiveDate: "2026-06-20",
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
    kind: "circuit",
    identifier: ZOMBIE.asset,
    status: "decommissioned",
    lastActiveDate: "2025-05-30",
    provisioned: false,
    feature: null,
    used: null,
    tier: null,
    period: null,
    count: null,
    decommissionDate: "2025-05-30",
  },
];

const record = VendorRecordSchema.parse({
  vendor: { id, name, category, aliases: ["Meridian Telecom LLC", "Meridian Communications"] },
  contract,
  invoices: series,
  usage,
});

// $1,250/mo billed for all 12 months after decommission.
const monthlyWaste = ZOMBIE.mrc; // 125000 cents
const seed: VendorSeed = {
  record,
  expected: [
    {
      vendorId: id,
      ruleId: "R11",
      category: "overbilling",
      savingsType: "recovery",
      annualizedSavingsCents: monthlyWaste * 12, // 1,500,000
      recoverableToDateCents: monthlyWaste * 12, // 1,500,000 — billed 12 mo post-decommission
      note: "Decommissioned Detroit circuit CKT-4417 billed $1,250/mo MRC for 12 months after the site closed 2025-05-30",
    },
  ],
};

export default seed;

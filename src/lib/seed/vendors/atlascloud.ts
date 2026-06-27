/**
 * AtlasCloud (IaaS) — cloud compute/storage under a committed-spend agreement.
 * Planted findings:
 *   R09 minimum-commitment shortfall: $480,000/yr committed (annual
 *       measurement period) but only ~$360,000/yr actually consumed
 *       ($30,000/mo) => a $120,000/yr take-or-pay shortfall the buyer pays for
 *       and does not use. Right-sizing the next-term commitment recaptures
 *       ~$34,000/yr (avoidance; tie to the renewal window).
 *   R13 (cross-vendor): capabilityTags include the exact string
 *       "Managed Detection & Response (MDR)" — this security add-on overlaps
 *       RedShield Cyber's standalone MDR subscription, so RedShield becomes a
 *       non-renewal candidate. (RedShield carries the R13 dollar finding; here
 *       we only plant the overlapping capability tag.)
 *
 * endDate is multi-year out so R01 does NOT fire here.
 */
import { VendorRecordSchema } from "../../types";
import { slug } from "../../docmodel/serialize";
import { usd, makeContract, invoiceSeries, li, NET30 } from "../helpers";
import type { VendorSeed } from "../types";

const name = "AtlasCloud (IaaS)";
const id = slug(name);

// Actual monthly consumption = $30,000 => $360,000/yr.
const COMPUTE = usd(22_000); // on-demand vCPU-hours
const STORAGE = usd(5_000); // block + object storage
const EGRESS = usd(3_000); // data transfer out
const MONTHLY_CONSUMPTION = COMPUTE + STORAGE + EGRESS; // 3,000,000 cents = $30,000
const ANNUAL_CONSUMPTION = MONTHLY_CONSUMPTION * 12; // 36,000,000 = $360,000

const MIN_COMMIT = usd(480_000); // committed-spend floor per year

const contract = makeContract({
  vendorName: name,
  category: "Cloud/hosting",
  effectiveDate: "2025-01-01",
  endDate: "2027-12-31", // multi-year => no R01
  initialTermMonths: 36,
  autoRenew: true,
  noticeWindowDays: 60,
  governingLaw: "Washington",
  currentAnnualValueCents: MIN_COMMIT,
  payment: NET30,
  rateCard: [
    { sku: "IAAS-CPU", description: "On-Demand Compute (vCPU-hours)", uom: "vcpu-hour", unitPriceCents: usd(0.05) },
    { sku: "IAAS-STG", description: "Block & Object Storage", uom: "GB-month", unitPriceCents: usd(0.1) },
    { sku: "IAAS-EGR", description: "Data Transfer Out", uom: "GB", unitPriceCents: usd(0.08) },
  ],
  commitment: {
    minCommitSpendCents: MIN_COMMIT,
    measurementPeriod: "annual",
  },
  // R13 overlap: the bundled MDR security add-on duplicates RedShield Cyber.
  capabilityTags: ["IaaS", "Compute", "Storage", "Managed Detection & Response (MDR)"],
  signatory: { name: "Helena Voss", title: "VP Infrastructure", date: "2024-12-15" },
});

const series = invoiceSeries({
  vendorId: id,
  vendorName: name,
  fileBase: id,
  start: "2025-07-01",
  count: 12,
  numberPrefix: "AC-INV",
  poNumber: "PO-NW-1180",
  payment: NET30,
  ein: "91-2240178",
  lines: () => [
    li({ description: "On-Demand Compute (vCPU-hours)", sku: "IAAS-CPU", uom: "vcpu-hour", qty: 440_000, unitPriceCents: usd(0.05), lineType: "usage" }),
    li({ description: "Block & Object Storage", sku: "IAAS-STG", uom: "GB-month", qty: 50_000, unitPriceCents: usd(0.1), lineType: "usage" }),
    li({ description: "Data Transfer Out", sku: "IAAS-EGR", uom: "GB", qty: 37_500, unitPriceCents: usd(0.08), lineType: "usage" }),
  ],
});

const record = VendorRecordSchema.parse({
  vendor: { id, name, category: "Cloud/hosting", aliases: ["AtlasCloud Services, Inc.", "Atlas Cloud"] },
  contract,
  invoices: series,
  usage: [],
});

// $480K committed vs $360K consumed = $120K/yr take-or-pay shortfall (75%
// utilization). In-term the floor is owed; the realizable saving is right-sizing
// the next-term commitment to consumption plus a 10% buffer ($396K), per the
// R09 formula: currentCommit - projectedActual*(1+buffer) = 480K - 396K = $84K.
const RIGHT_SIZED_COMMIT = Math.round(ANNUAL_CONSUMPTION * 1.1); // $396,000
const annualizedSavingsCents = MIN_COMMIT - RIGHT_SIZED_COMMIT; // $84,000

const seed: VendorSeed = {
  record,
  expected: [
    {
      vendorId: id,
      ruleId: "R09",
      category: "minimum_commit",
      savingsType: "avoidance",
      annualizedSavingsCents,
      note: "$480,000/yr committed vs $360,000 consumed ($30,000/mo, 75% utilization). Right-sizing the next-term commitment to $396,000 (consumption + 10% buffer) recaptures $84,000/yr.",
    },
  ],
};

export default seed;

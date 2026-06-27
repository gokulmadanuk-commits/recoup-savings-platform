/**
 * NimbusEdge CDN — cloud CDN + egress/bandwidth, usage-billed. Planted finding:
 *   R05/R07 missed volume tier: the contract's volume-tier table drops egress
 *       from $0.09/GB to $0.08/GB once cumulative annual egress crosses
 *       1,000,000 GB, but every invoice keeps billing the standard $0.09/GB
 *       even after the buyer earns the cheaper tier. Cumulative egress reaches
 *       1,280,004 GB over the year (crosses the breakpoint ~month 10), so the
 *       earned $0.08 tier should apply to the full annual volume.
 *       Saving = ($0.09 - $0.08) * 1,280,004 GB = $12,800.04/yr.
 *
 * endDate is multi-year out so R01 does NOT fire here.
 */
import { VendorRecordSchema } from "../../types";
import { slug } from "../../docmodel/serialize";
import { usd, makeContract, invoiceSeries, li, NET30 } from "../helpers";
import type { VendorSeed } from "../types";

const name = "NimbusEdge CDN";
const id = slug(name);

const STANDARD_RATE = usd(0.09); // 9 cents/GB (Tier 1, < 1,000,000 GB)
const EARNED_RATE = usd(0.08); // 8 cents/GB (Tier 2, >= 1,000,000 GB) — earned but not applied
const MONTHLY_EGRESS_GB = 106_667; // integer; * 12 = 1,280,004 GB/yr
const REQUESTS_PER_MO = 20_000; // CDN request units, flat per-million proxy
const REQUEST_PRICE = usd(0.5); // $0.50 per million requests
const PLATFORM_FEE = usd(800);

const ANNUAL_EGRESS_GB = MONTHLY_EGRESS_GB * 12; // 1,280,004

const contract = makeContract({
  vendorName: name,
  category: "Cloud/hosting",
  effectiveDate: "2025-03-01",
  endDate: "2027-02-28", // multi-year => no R01
  initialTermMonths: 24,
  autoRenew: true,
  noticeWindowDays: 45,
  governingLaw: "California",
  currentAnnualValueCents:
    (MONTHLY_EGRESS_GB * STANDARD_RATE + REQUESTS_PER_MO * REQUEST_PRICE + PLATFORM_FEE) * 12,
  payment: NET30,
  rateCard: [
    { sku: "CDN-REQ", description: "CDN Requests (per million)", uom: "million-req", unitPriceCents: REQUEST_PRICE },
    { sku: "CDN-BASE", description: "CDN Platform Base Fee", uom: "flat", unitPriceCents: PLATFORM_FEE },
  ],
  // Volume tiers: cumulative annual egress earns the cheaper Tier 2 rate.
  tiers: [
    { tierMin: 0, tierMax: 1_000_000, baseFeeCents: 0, unitPriceCents: STANDARD_RATE },
    { tierMin: 1_000_000, tierMax: null, baseFeeCents: 0, unitPriceCents: EARNED_RATE },
  ],
  capabilityTags: ["CDN", "Edge Delivery", "Egress"],
  signatory: { name: "Tomas Berg", title: "Director of Platform Engineering", date: "2025-02-18" },
});

const series = invoiceSeries({
  vendorId: id,
  vendorName: name,
  fileBase: id,
  start: "2025-07-01",
  count: 12,
  numberPrefix: "NE-INV",
  poNumber: "PO-NW-1191",
  payment: NET30,
  ein: "33-7781204",
  taxRate: 0,
  lines: () => [
    // Egress billed at the STANDARD $0.09/GB even though the cheaper tier is earned.
    li({ description: "Egress / Data Transfer Out", sku: "CDN-EGR", uom: "GB", qty: MONTHLY_EGRESS_GB, unitPriceCents: STANDARD_RATE, lineType: "usage" }),
    li({ description: "CDN Requests (per million)", sku: "CDN-REQ", uom: "million-req", qty: REQUESTS_PER_MO, unitPriceCents: REQUEST_PRICE, lineType: "usage" }),
    li({ description: "CDN Platform Base Fee", sku: "CDN-BASE", uom: "flat", qty: 1, unitPriceCents: PLATFORM_FEE, lineType: "fee" }),
  ],
});

const record = VendorRecordSchema.parse({
  vendor: { id, name, category: "Cloud/hosting", aliases: ["NimbusEdge Networks, Inc."] },
  contract,
  invoices: series,
  usage: [],
});

// Missed volume discount: ($0.09 - $0.08)/GB over the full earned-tier annual volume.
const perGbDeltaCents = STANDARD_RATE - EARNED_RATE; // 1 cent
const annualizedSavingsCents = perGbDeltaCents * ANNUAL_EGRESS_GB; // 1 * 1,280,004 = 1,280,004 ($12,800.04)

const seed: VendorSeed = {
  record,
  expected: [
    {
      vendorId: id,
      ruleId: "R07",
      category: "missed_discount",
      savingsType: "recovery",
      annualizedSavingsCents,
      recoverableToDateCents: annualizedSavingsCents,
      note: "Egress billed at $0.09/GB all year; cumulative 1,280,004 GB crosses the 1,000,000 GB breakpoint and earns $0.08/GB. ($0.09-$0.08) * 1,280,004 = $12,800.04/yr.",
    },
  ],
};

export default seed;

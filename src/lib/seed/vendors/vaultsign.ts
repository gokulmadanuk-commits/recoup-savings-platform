/**
 * VaultSign eSignature — SaaS e-signature (seats + envelope overage). Planted
 * finding:
 *   R05 overage / usage-tier mismatch: plan includes 500 envelopes/mo; every
 *       month bills 1,150 envelopes => 650 over the allowance at a punitive
 *       $2.00/envelope overage rate. A higher-allowance buy-up tier (1,500
 *       envelopes for a flat +$350/mo) would absorb the same usage for far
 *       less. Saving = $1,300/mo overage - $350/mo buy-up = $950/mo =>
 *       $11,400/yr (avoidance via tier buy-up).
 *
 * endDate is multi-year out so R01 does NOT fire here.
 */
import { VendorRecordSchema } from "../../types";
import { slug } from "../../docmodel/serialize";
import { usd, makeContract, invoiceSeries, li, NET30 } from "../helpers";
import type { VendorSeed } from "../types";

const name = "VaultSign eSignature";
const id = slug(name);

const SEATS = 40;
const SEAT_PRICE = usd(30); // $30/seat/mo
const INCLUDED_ENVELOPES = 500;
const BILLED_ENVELOPES = 1_150;
const OVERAGE_ENVELOPES = BILLED_ENVELOPES - INCLUDED_ENVELOPES; // 650
const OVERAGE_PRICE = usd(2.0); // punitive $2.00/envelope
const BASE_PLATFORM = usd(1_200); // monthly base incl. 500 envelope allowance

const contract = makeContract({
  vendorName: name,
  category: "SaaS (usage+seat)",
  effectiveDate: "2025-02-01",
  endDate: "2027-01-31", // multi-year => no R01
  initialTermMonths: 24,
  autoRenew: true,
  noticeWindowDays: 30,
  governingLaw: "Delaware",
  currentAnnualValueCents:
    (SEATS * SEAT_PRICE + BASE_PLATFORM + OVERAGE_ENVELOPES * OVERAGE_PRICE) * 12,
  payment: NET30,
  rateCard: [
    { sku: "ESIGN-SEAT", description: "Business Seat License", uom: "seat", unitPriceCents: SEAT_PRICE },
    { sku: "ESIGN-BASE", description: "Platform Base (incl. 500 envelopes/mo)", uom: "flat", unitPriceCents: BASE_PLATFORM },
    { sku: "ESIGN-OVG", description: "Envelope Overage", uom: "envelope", unitPriceCents: OVERAGE_PRICE },
  ],
  commitment: {
    includedAllowance: INCLUDED_ENVELOPES,
    overageUnitPriceCents: OVERAGE_PRICE,
    measurementPeriod: "monthly",
    contractedSeats: SEATS,
    tier: "Business",
  },
  // Buy-up alternative: a 1,500-envelope tier for a flat +$350/mo over base.
  tiers: [
    { tierMin: 0, tierMax: 500, baseFeeCents: BASE_PLATFORM, unitPriceCents: 0, overageRateCents: OVERAGE_PRICE },
    { tierMin: 501, tierMax: 1_500, baseFeeCents: BASE_PLATFORM + usd(350), unitPriceCents: 0, overageRateCents: OVERAGE_PRICE },
  ],
  capabilityTags: ["E-Signature", "Document Workflow"],
  signatory: { name: "Owen Caldwell", title: "VP Legal Operations", date: "2025-01-20" },
});

const series = invoiceSeries({
  vendorId: id,
  vendorName: name,
  fileBase: id,
  start: "2025-07-01",
  count: 12,
  numberPrefix: "VS-INV",
  poNumber: "PO-NW-1133",
  payment: NET30,
  ein: "61-3398215",
  taxRate: 0,
  lines: () => [
    li({ description: "Business Seat License", sku: "ESIGN-SEAT", uom: "seat", qty: SEATS, unitPriceCents: SEAT_PRICE, lineType: "seat" }),
    li({ description: "Platform Base (incl. 500 envelopes/mo)", sku: "ESIGN-BASE", uom: "flat", qty: 1, unitPriceCents: BASE_PLATFORM, lineType: "fee" }),
    li({ description: "Envelope Overage", sku: "ESIGN-OVG", uom: "envelope", qty: OVERAGE_ENVELOPES, unitPriceCents: OVERAGE_PRICE, lineType: "overage" }),
  ],
});

const record = VendorRecordSchema.parse({
  vendor: { id, name, category: "SaaS (usage+seat)", aliases: ["VaultSign, Inc."] },
  contract,
  invoices: series,
  usage: [],
});

// Current overage cost: 650 * $2.00 = $1,300/mo. Buy-up to the 1,500 tier costs
// a flat +$350/mo and absorbs all usage. Monthly saving = $1,300 - $350 = $950.
const monthlyOverageCents = OVERAGE_ENVELOPES * OVERAGE_PRICE; // 130000
const buyUpDeltaCents = usd(350);
const monthlySavingCents = monthlyOverageCents - buyUpDeltaCents; // 95000
const annualizedSavingsCents = monthlySavingCents * 12; // 1,140,000 = $11,400

const seed: VendorSeed = {
  record,
  expected: [
    {
      vendorId: id,
      ruleId: "R05",
      category: "tier_optimization",
      savingsType: "avoidance",
      annualizedSavingsCents,
      note: "1,150 envelopes/mo vs 500 included => 650 overage @ $2.00 ($1,300/mo). Buy-up to 1,500-envelope tier (+$350/mo) saves $950/mo = $11,400/yr.",
    },
  ],
};

export default seed;

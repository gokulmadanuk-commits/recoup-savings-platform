/**
 * DeskFlow ITSM — SaaS IT service-desk ticketing (tiered seats). Planted finding:
 *   R01 auto-renewal: contract auto-renews 2026-08-18 (52 days from the
 *       2026-06-27 analysis date) with a 60-day notice window, so the
 *       cancellation-notice deadline (2026-06-19) has ALREADY passed -> the
 *       buyer is locked into another 12-month term unless renegotiated.
 *       Renewal is at +7%, putting ~$72,000/yr at risk (avoidance).
 *
 * Trailing-12 invoices ($5,608/mo => $67,296/yr) establish the current spend;
 * the renewal bumps that +7% to the ~$72K figure surfaced as "$ at risk".
 */
import { VendorRecordSchema } from "../../types";
import { slug } from "../../docmodel/serialize";
import { usd, makeContract, invoiceSeries, li, NET30 } from "../helpers";
import type { VendorSeed } from "../types";

const name = "DeskFlow ITSM";
const id = slug(name);

// Current spend: 90 agent seats @ $46/mo + $1,468 platform fee = $5,608/mo.
const AGENT_SEATS = 90;
const AGENT_PRICE = usd(46);
const PLATFORM_FEE = usd(1_468);
const MONTHLY = AGENT_SEATS * AGENT_PRICE + PLATFORM_FEE; // 560800 cents = $5,608
const CURRENT_ANNUAL = MONTHLY * 12; // 6,729,600 cents = $67,296/yr

const contract = makeContract({
  vendorName: name,
  category: "SaaS (per-seat)",
  effectiveDate: "2025-08-19",
  // Auto-renews 2026-08-18 => 52 days from 2026-06-27 (within the 90-day window).
  endDate: "2026-08-18",
  initialTermMonths: 12,
  autoRenew: true,
  // 60-day notice => deadline 2026-06-19, already passed as of 2026-06-27 (CRITICAL).
  noticeWindowDays: 60,
  noticeMethod: "written notice to vendor account manager",
  renewalTermMonths: 12,
  governingLaw: "Delaware",
  currentAnnualValueCents: CURRENT_ANNUAL,
  payment: NET30,
  rateCard: [
    { sku: "DESK-AGENT", description: "ITSM Agent Seat (Pro tier)", uom: "seat", unitPriceCents: AGENT_PRICE },
    { sku: "DESK-PLATFORM", description: "ITSM Platform Base Fee", uom: "flat", unitPriceCents: PLATFORM_FEE },
  ],
  commitment: { contractedSeats: AGENT_SEATS, tier: "Pro", tierPricePerSeatCents: AGENT_PRICE },
  capabilityTags: ["ITSM", "Service Desk", "Ticketing"],
  signatory: { name: "Priya Raman", title: "Director of IT Operations", date: "2025-08-12" },
});

const series = invoiceSeries({
  vendorId: id,
  vendorName: name,
  fileBase: id,
  start: "2025-08-01",
  count: 12,
  numberPrefix: "DF-INV",
  poNumber: "PO-NW-1209",
  payment: NET30,
  ein: "27-5512094",
  lines: () => [
    li({ description: "ITSM Agent Seat (Pro tier)", sku: "DESK-AGENT", uom: "seat", qty: AGENT_SEATS, unitPriceCents: AGENT_PRICE, lineType: "seat" }),
    li({ description: "ITSM Platform Base Fee", sku: "DESK-PLATFORM", uom: "flat", qty: 1, unitPriceCents: PLATFORM_FEE, lineType: "fee" }),
  ],
});

const record = VendorRecordSchema.parse({
  vendor: { id, name, category: "SaaS (per-seat)", aliases: ["DeskFlow, Inc.", "DeskFlow ITSM LLC"] },
  contract,
  invoices: series,
  usage: [],
});

// R01 "$ at risk" = renewal annual value. Renewal term 12 months => full
// post-renewal annual value, which is current spend +7%.
// 6,729,600 * 1.07 = 7,200,672 cents = $72,006.72; documented as ~$72,000.
const renewalAtRiskCents = usd(72_000);

const seed: VendorSeed = {
  record,
  expected: [
    {
      vendorId: id,
      ruleId: "R01",
      category: "auto_renewal",
      savingsType: "avoidance",
      annualizedSavingsCents: renewalAtRiskCents,
      note: "Auto-renews 2026-08-18 (52 days out); 60-day notice deadline already passed. Renewal at +7% on $67,296 current => ~$72,000/yr at risk for the 12-month renewal term.",
    },
  ],
};

export default seed;

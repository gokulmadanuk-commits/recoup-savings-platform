/**
 * Vertex Advisory LLP — accounting/audit, fixed monthly fee + hourly advisory.
 * Two planted findings:
 *   R04 price escalator: the fixed retainer fee was escalated 8% at the Jan
 *       2026 anniversary, but the contract caps escalation at a fixed 3%.
 *       Prior fee $12,000/mo -> escalated $12,960/mo; the contract only allowed
 *       $12,360/mo. Challengeable = $12,000 * (0.08 - 0.03) * 12 = $7,200/yr.
 *   R08 missed early-pay: terms are 2/10 Net 30, but AP pays ~20 days after the
 *       invoice date every month, after the 10-day discount window closes, so
 *       the 2% discount is forfeited on every invoice.
 *
 * 14 monthly invoices (Jul 2025 - Aug 2026) span the Jan-2026 anniversary so
 * the year-over-year fee jump is visible. Non-R01: term ends 2027-12-31.
 */
import { VendorRecordSchema } from "../../types";
import { slug } from "../../docmodel/serialize";
import { addDays } from "../../dates";
import {
  usd,
  makeContract,
  invoiceSeries,
  li,
  TERMS_2_10_NET30,
} from "../helpers";
import type { VendorSeed } from "../types";

const name = "Vertex Advisory LLP";
const id = slug(name);
const category = "Professional services";

const FEE_PRIOR = usd(12_000); // $12,000/mo retainer (pre-anniversary)
const ESCALATED_PCT = 0.08; // vendor applied 8%
const FEE_ESCALATED = usd(12_960); // $12,000 * 1.08
const HOURLY_RATE = usd(250); // $250/hr advisory
const HOURLY_QTY = 20; // 20 hrs/mo
const HOURLY_BLOCK = HOURLY_RATE * HOURLY_QTY; // $5,000/mo
const ANNIVERSARY_INDEX = 6; // month index where Jan 2026 falls (Jul 2025 start)

const contract = makeContract({
  vendorName: name,
  category,
  effectiveDate: "2025-01-01",
  endDate: "2027-12-31",
  initialTermMonths: 36,
  autoRenew: true,
  noticeWindowDays: 90,
  governingLaw: "Illinois",
  currentAnnualValueCents: (FEE_PRIOR + HOURLY_BLOCK) * 12,
  payment: TERMS_2_10_NET30,
  rateCard: [
    { sku: "AUDIT-RETAINER", description: "Monthly Audit & Advisory Retainer", uom: "month", unitPriceCents: FEE_PRIOR },
    { sku: "ADV-HOURLY", description: "Advisory Services (hourly)", uom: "hour", unitPriceCents: HOURLY_RATE },
  ],
  // Contract caps escalation at a fixed 3%.
  escalator: { type: "fixed", fixedPct: 0.03, capPct: 0.03, anniversaryMonth: 1 },
  signatory: { name: "Helena Brandt", title: "Managing Partner", date: "2024-12-12" },
});

const series = invoiceSeries({
  vendorId: id,
  vendorName: name,
  fileBase: id,
  start: "2025-07-01",
  count: 14,
  numberPrefix: "VX-INV",
  poNumber: "PO-NW-1255",
  payment: TERMS_2_10_NET30,
  ein: "36-8841207",
  // Pay ~20 days after invoice date -> always past the 10-day discount window.
  payDate: (m) => addDays(m.invoiceDate, 20),
  lines: (m) => [
    li({
      description: "Monthly Audit & Advisory Retainer",
      sku: "AUDIT-RETAINER",
      uom: "month",
      qty: 1,
      unitPriceCents: m.index >= ANNIVERSARY_INDEX ? FEE_ESCALATED : FEE_PRIOR,
      lineType: "fee",
    }),
    li({
      description: "Advisory Services (hourly)",
      sku: "ADV-HOURLY",
      uom: "hour",
      qty: HOURLY_QTY,
      unitPriceCents: HOURLY_RATE,
      lineType: "labor",
    }),
  ],
});

const record = VendorRecordSchema.parse({
  vendor: { id, name, category, aliases: ["Vertex Advisory LLP", "Vertex Advisory Partners"] },
  contract,
  invoices: series,
  usage: [],
});

// R04: challengeable uplift = prior fee * (applied 8% - allowed 3%) * 12 months.
const r04Annual = Math.round(FEE_PRIOR * (ESCALATED_PCT - 0.03)) * 12; // 600 * 12 = 720000

// R08: 2% discount forfeited on every invoice.
// recoverableToDate = actual missed discount summed over all 14 invoices;
// annualized = 12 months of missed discount at the current (escalated) total.
const DISCOUNT_PCT = 0.02;
const r08Recoverable = series.reduce(
  (a, inv) => a + Math.round(inv.totalCents * DISCOUNT_PCT),
  0,
);
const escalatedMonthlyTotal = FEE_ESCALATED + HOURLY_BLOCK; // $17,960
const r08Annual = Math.round(escalatedMonthlyTotal * DISCOUNT_PCT) * 12; // 35920 * 12 = 431040

const seed: VendorSeed = {
  record,
  expected: [
    {
      vendorId: id,
      ruleId: "R04",
      category: "price_escalator",
      savingsType: "recovery",
      annualizedSavingsCents: r04Annual,
      recoverableToDateCents: r04Annual,
      note: "Fixed retainer escalated 8% vs contract 3% cap; $12,000/mo base, challengeable 5% over 12 months",
    },
    {
      vendorId: id,
      ruleId: "R08",
      category: "missed_discount",
      savingsType: "recovery",
      annualizedSavingsCents: r08Annual,
      recoverableToDateCents: r08Recoverable,
      note: "2/10 Net 30 discount forfeited every month (paid ~20 days after invoice date)",
    },
  ],
};

export default seed;

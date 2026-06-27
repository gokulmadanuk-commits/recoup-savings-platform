/**
 * PristineCare Facilities — nightly janitorial across 3 offices, flat monthly.
 * Planted finding:
 *   R04 escalator-above-cap: the contract's escalator is fixed 4% with a 4% cap,
 *       but at the renewal anniversary the monthly fee jumped 9% — a breach of
 *       the contract's own cap. Prior-year base $284,400/yr ($23,700/mo); the
 *       challengeable portion is (9% - 4%) = 5% of the prior base =>
 *       $14,220/yr recoverable.
 *
 * The series spans the September anniversary so the year-over-year jump from
 * $23,700/mo to $25,833/mo (+9%) is visible across consecutive periods.
 */
import { VendorRecordSchema } from "../../types";
import { slug } from "../../docmodel/serialize";
import { usd, makeContract, invoiceSeries, li, NET30 } from "../helpers";
import type { VendorSeed } from "../types";

const name = "PristineCare Facilities";
const id = slug(name);
const category = "Facilities/janitorial";

// Prior-year monthly fee and the +9% post-anniversary fee.
const priorMonthly = usd(23_700); // $284,400/yr base
const bumpedMonthly = usd(23_700 * 1.09); // +9% => $25,833.00/mo

// Anniversary is September (effectiveDate 2024-09-01); series starts May 2025.
const anniversaryIndex = 4; // index 0 = May 2025, index 4 = Sep 2025

const contract = makeContract({
  vendorName: name,
  category,
  effectiveDate: "2024-09-01",
  endDate: "2027-08-31",
  initialTermMonths: 36,
  autoRenew: true,
  noticeWindowDays: 60,
  governingLaw: "Ohio",
  currentAnnualValueCents: bumpedMonthly * 12,
  payment: NET30,
  rateCard: [
    {
      sku: "JAN-NIGHTLY",
      description: "Nightly Janitorial Services (3 offices)",
      uom: "month",
      unitPriceCents: priorMonthly,
    },
  ],
  // Fixed 4% escalator, capped at 4% — the cap the actual 9% bump breaches.
  escalator: { type: "fixed", fixedPct: 0.04, capPct: 0.04, anniversaryMonth: 9 },
  capabilityTags: ["Janitorial", "Facilities"],
  signatory: { name: "Renata Alvarez", title: "Director of Facilities", date: "2024-08-12" },
});

const series = invoiceSeries({
  vendorId: id,
  vendorName: name,
  fileBase: id,
  start: "2025-05-01",
  count: 14, // May 2025 .. Jun 2026, spanning the Sep anniversary
  numberPrefix: "PC-INV",
  poNumber: "PO-NW-1310",
  payment: NET30,
  taxRate: 0.075,
  ein: "31-7741022",
  lines: (m) => [
    li({
      description: "Nightly Janitorial Services (3 offices)",
      sku: "JAN-NIGHTLY",
      uom: "month",
      qty: 1,
      unitPriceCents: m.index >= anniversaryIndex ? bumpedMonthly : priorMonthly,
      lineType: "recurring",
    }),
  ],
});

const record = VendorRecordSchema.parse({
  vendor: { id, name, category, aliases: ["PristineCare Facilities Services, LLC"] },
  contract,
  invoices: series,
  usage: [],
});

// Challengeable = (actual 9% - cap 4%) of prior-year annual base.
const challengeablePct = 0.09 - 0.04; // 0.05
const priorAnnualBase = priorMonthly * 12; // $284,400.00
const annualChallenge = Math.round(priorAnnualBase * challengeablePct); // $14,220.00

const seed: VendorSeed = {
  record,
  expected: [
    {
      vendorId: id,
      ruleId: "R04",
      category: "price_escalator",
      savingsType: "recovery",
      annualizedSavingsCents: annualChallenge,
      recoverableToDateCents: annualChallenge,
      note: "9% escalation applied vs contract's 4% cap; (9%-4%) x $284,400 prior-year base",
    },
  ],
};

export default seed;

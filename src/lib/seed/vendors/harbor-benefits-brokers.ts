/**
 * Harbor Benefits Brokers — group benefits admin billed per-employee-per-month
 * (PEPM). Planted finding:
 *   R14 headcount overbilling: invoices bill PEPM ($24.00) on 640 employees, but
 *       the authoritative HRIS roster (a headcount usage export) shows 600 for
 *       each period. Overcharge = (640 - 600) x $24.00 x 12 = $11,520/yr.
 */
import { VendorRecordSchema } from "../../types";
import { slug } from "../../docmodel/serialize";
import { usd, makeContract, invoiceSeries, months, li, NET30 } from "../helpers";
import type { VendorSeed, ExpectedFinding } from "../types";
import type { UsageRecord } from "../../types";

const name = "Harbor Benefits Brokers";
const id = slug(name);
const category = "Insurance (benefits)";

const pepmRateCents = usd(24); // $24.00 PEPM
const billedHeadcount = 640;
const rosterHeadcount = 600;

const contract = makeContract({
  vendorName: name,
  category,
  effectiveDate: "2025-01-01",
  endDate: "2027-12-31", // multi-year term -> R01 does NOT fire
  initialTermMonths: 36,
  autoRenew: true,
  noticeWindowDays: 60,
  governingLaw: "Ohio",
  currentAnnualValueCents: pepmRateCents * billedHeadcount * 12,
  payment: NET30,
  pepmRateCents,
  capabilityTags: ["Benefits Administration", "Group Health"],
  signatory: { name: "Priya Raman", title: "Director of HR", date: "2024-12-05" },
});

const series = invoiceSeries({
  vendorId: id,
  vendorName: name,
  fileBase: id,
  start: "2025-07-01",
  count: 12,
  numberPrefix: "HBB-INV",
  poNumber: "PO-NW-1322",
  payment: NET30,
  ein: "52-3098471",
  lines: () => [
    li({
      description: "Benefits Administration (PEPM)",
      sku: "BEN-ADMIN-PEPM",
      uom: "employee",
      qty: billedHeadcount,
      unitPriceCents: pepmRateCents,
      lineType: "fee",
    }),
  ],
});

// Authoritative HRIS roster: 600 employees per billing period. The rule compares
// invoiced billable count (640) against this roster (600).
const usage: UsageRecord[] = months("2025-07-01", 12).map((m) => ({
  vendorId: id,
  kind: "headcount" as const,
  identifier: `roster-${m.ym}`,
  status: null,
  lastActiveDate: null,
  provisioned: true,
  feature: null,
  used: null,
  tier: null,
  period: m.ym,
  count: rosterHeadcount,
  decommissionDate: null,
}));

const record = VendorRecordSchema.parse({
  vendor: { id, name, category, aliases: ["Harbor Benefits Brokers LLC"] },
  contract,
  invoices: series,
  usage,
});

const countOvercharge: ExpectedFinding = {
  vendorId: id,
  ruleId: "R14",
  category: "overbilling",
  savingsType: "recovery",
  annualizedSavingsCents: (billedHeadcount - rosterHeadcount) * pepmRateCents * 12, // $11,520
  recoverableToDateCents: (billedHeadcount - rosterHeadcount) * pepmRateCents * 12,
  note: "PEPM billed on 640 employees vs 600 HRIS roster at $24.00 PEPM x 12 months",
};

const seed: VendorSeed = { record, expected: [countOvercharge] };

export default seed;

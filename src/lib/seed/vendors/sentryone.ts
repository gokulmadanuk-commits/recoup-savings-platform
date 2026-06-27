/**
 * SentryOne Protective — unarmed guard post coverage, hourly bill rate.
 * Planted finding:
 *   R12 labor overbilling, two components:
 *     (a) holiday-premium lines billed on NON-holiday dates — 6 days at 24 hrs,
 *         holiday rate $60 vs regular $30 => premium overcharge
 *         24 x ($60-$30) x 6 = $4,320.
 *     (b) overtime hours exceeding the scheduled post — the single 24/7 post is
 *         fully covered by the 168 scheduled hrs/week, so ALL billed OT is
 *         beyond schedule: 27 OT hrs/mo x $45 x 12 = $14,580.
 *   Total recoverable: $4,320 + $14,580 = $18,900/yr.
 */
import { VendorRecordSchema } from "../../types";
import { slug } from "../../docmodel/serialize";
import { usd, makeContract, invoiceSeries, li, NET30 } from "../helpers";
import type { VendorSeed } from "../types";

const name = "SentryOne Protective";
const id = slug(name);
const category = "Security";

const regRate = usd(30);
const otRate = usd(45);
const holRate = usd(60);

const monthlyRegularHours = 720; // ~24/7 post coverage billed as regular
const otHoursPerMonth = 27; // OT beyond the 168 hr/week scheduled post
const holidayMisappliedHours = 24; // one full post-day per misapplied holiday line

// Actual contracted holidays (the only dates a holiday premium is warranted).
const holidayCalendar = [
  "2025-07-04",
  "2025-09-01",
  "2025-11-27",
  "2025-12-25",
  "2026-01-01",
  "2026-05-25",
];

// Months (series indexes; start = Jul 2025) that carry a misapplied holiday
// line on an ORDINARY (non-holiday) service date. 6 months => 6 misapplied days.
const misappliedHolidayIndexes = new Set([1, 3, 5, 7, 9, 11]);
const nonHolidayServiceDate = (monthStart: string) =>
  // 15th of the month — never a date in holidayCalendar above.
  `${monthStart.slice(0, 7)}-15`;

const contract = makeContract({
  vendorName: name,
  category,
  effectiveDate: "2024-12-01",
  endDate: "2027-11-30",
  initialTermMonths: 36,
  autoRenew: true,
  noticeWindowDays: 30,
  governingLaw: "Ohio",
  currentAnnualValueCents: regRate * monthlyRegularHours * 12,
  payment: NET30,
  rateCard: [
    { sku: "GRD-REG", description: "Unarmed Guard — Regular", uom: "hour", unitPriceCents: regRate },
    { sku: "GRD-OT", description: "Unarmed Guard — Overtime", uom: "hour", unitPriceCents: otRate },
    { sku: "GRD-HOL", description: "Unarmed Guard — Holiday Premium", uom: "hour", unitPriceCents: holRate },
  ],
  // Single 24/7 post = 168 scheduled hours per week; any OT is beyond schedule.
  scheduledHoursPerWeek: 168,
  holidayCalendar,
  capabilityTags: ["Physical Security", "Guard Services"],
  signatory: { name: "Derek Salisbury", title: "Security Operations Lead", date: "2024-11-08" },
});

const series = invoiceSeries({
  vendorId: id,
  vendorName: name,
  fileBase: id,
  start: "2025-07-01",
  count: 12, // Jul 2025 .. Jun 2026
  numberPrefix: "SO-INV",
  poNumber: "PO-NW-1335",
  payment: NET30,
  taxRate: 0,
  ein: "31-5582910",
  lines: (m) => {
    const lines = [
      li({
        description: "Unarmed Guard — Regular",
        sku: "GRD-REG",
        uom: "hour",
        qty: monthlyRegularHours,
        unitPriceCents: regRate,
        lineType: "labor",
        laborType: "regular",
        serviceDate: m.monthStart,
      }),
      // OT hours that exceed the fully-covered 168 hr/week post schedule.
      li({
        description: "Unarmed Guard — Overtime",
        sku: "GRD-OT",
        uom: "hour",
        qty: otHoursPerMonth,
        unitPriceCents: otRate,
        lineType: "labor",
        laborType: "ot",
        serviceDate: m.monthStart,
      }),
    ];
    if (misappliedHolidayIndexes.has(m.index)) {
      // Holiday premium applied on a non-holiday service date.
      lines.push(
        li({
          description: "Unarmed Guard — Holiday Premium",
          sku: "GRD-HOL",
          uom: "hour",
          qty: holidayMisappliedHours,
          unitPriceCents: holRate,
          lineType: "labor",
          laborType: "holiday",
          serviceDate: nonHolidayServiceDate(m.monthStart),
        }),
      );
    }
    return lines;
  },
});

const record = VendorRecordSchema.parse({
  vendor: { id, name, category, aliases: ["SentryOne Protective Services, Inc."] },
  contract,
  invoices: series,
  usage: [],
});

// (a) misapplied holiday premium = premium over regular on non-holiday dates.
const holidayPremiumRecovery =
  holidayMisappliedHours * (holRate - regRate) * misappliedHolidayIndexes.size; // $4,320
// (b) OT beyond schedule = the full OT lines (post is fully covered by regular).
const otRecovery = otHoursPerMonth * otRate * 12; // $14,580
const totalRecovery = holidayPremiumRecovery + otRecovery; // $18,900

const seed: VendorSeed = {
  record,
  expected: [
    {
      vendorId: id,
      ruleId: "R12",
      category: "overbilling",
      savingsType: "recovery",
      annualizedSavingsCents: totalRecovery,
      recoverableToDateCents: totalRecovery,
      note: "Holiday premium on 6 non-holidays (24h x $30 premium x 6 = $4,320) + 27 OT hrs/mo beyond 168h/wk post x $45 x 12 = $14,580",
    },
  ],
};

export default seed;

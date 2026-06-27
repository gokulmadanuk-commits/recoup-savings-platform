/**
 * GreenScape Grounds — landscaping + seasonal snow removal, monthly.
 * Planted finding:
 *   R12 unperformed service: the contract's snow-removal season window is
 *       Nov–Mar, but a "Snow Removal" line is billed in clearly out-of-season
 *       summer months (Jul/Aug 2025, May/Jun 2026) with no qualifying snow
 *       event. Four out-of-season lines at $1,600 each => $6,400/yr recoverable.
 */
import { VendorRecordSchema } from "../../types";
import { slug } from "../../docmodel/serialize";
import { usd, makeContract, invoiceSeries, li, NET30 } from "../helpers";
import type { VendorSeed } from "../types";

const name = "GreenScape Grounds";
const id = slug(name);
const category = "Facilities (grounds)";

const monthlyLandscaping = usd(4_200);
const snowLine = usd(1_600);

// Out-of-season months (series indexes; start = Jul 2025):
//   index 0 = Jul 2025, 1 = Aug 2025, 10 = May 2026, 11 = Jun 2026.
const outOfSeasonIndexes = new Set([0, 1, 10, 11]);

const contract = makeContract({
  vendorName: name,
  category,
  effectiveDate: "2024-04-01",
  endDate: "2027-03-31",
  initialTermMonths: 36,
  autoRenew: true,
  noticeWindowDays: 30,
  governingLaw: "Ohio",
  currentAnnualValueCents: monthlyLandscaping * 12 + snowLine * 5, // landscaping + ~5 in-season snow months
  payment: NET30,
  rateCard: [
    { sku: "LND-MONTHLY", description: "Grounds & Landscaping Maintenance", uom: "month", unitPriceCents: monthlyLandscaping },
    { sku: "SNW-EVENT", description: "Snow Removal (per event)", uom: "event", unitPriceCents: snowLine },
  ],
  // Snow removal is only a contracted service Nov (11) through Mar (3).
  seasonWindows: [{ service: "Snow Removal", startMonth: 11, endMonth: 3 }],
  capabilityTags: ["Landscaping", "Snow Removal", "Grounds"],
  signatory: { name: "Tomas Reyes", title: "Facilities Manager", date: "2024-03-10" },
});

const series = invoiceSeries({
  vendorId: id,
  vendorName: name,
  fileBase: id,
  start: "2025-07-01",
  count: 12, // Jul 2025 .. Jun 2026
  numberPrefix: "GS-INV",
  poNumber: "PO-NW-1322",
  payment: NET30,
  taxRate: 0.075,
  ein: "31-6620199",
  lines: (m) => {
    const lines = [
      li({
        description: "Grounds & Landscaping Maintenance",
        sku: "LND-MONTHLY",
        uom: "month",
        qty: 1,
        unitPriceCents: monthlyLandscaping,
        lineType: "recurring",
      }),
    ];
    if (outOfSeasonIndexes.has(m.index)) {
      // Out-of-season snow-removal line with no qualifying snow event.
      lines.push(
        li({
          description: "Snow Removal (per event)",
          sku: "SNW-EVENT",
          uom: "event",
          qty: 1,
          unitPriceCents: snowLine,
          lineType: "recurring",
          serviceDate: m.monthStart,
        }),
      );
    }
    return lines;
  },
});

const record = VendorRecordSchema.parse({
  vendor: { id, name, category, aliases: ["GreenScape Grounds Co."] },
  contract,
  invoices: series,
  usage: [],
});

const outOfSeasonSnowTotal = snowLine * outOfSeasonIndexes.size; // 4 x $1,600 = $6,400

const seed: VendorSeed = {
  record,
  expected: [
    {
      vendorId: id,
      ruleId: "R12",
      category: "overbilling",
      savingsType: "recovery",
      annualizedSavingsCents: outOfSeasonSnowTotal,
      recoverableToDateCents: outOfSeasonSnowTotal,
      note: "4 out-of-season Snow Removal lines (Jul/Aug 2025, May/Jun 2026) billed outside Nov–Mar window at $1,600 each",
    },
  ],
};

export default seed;

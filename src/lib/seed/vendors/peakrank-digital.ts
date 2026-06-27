/**
 * PeakRank Digital — paid-media management billed as a percentage of monthly ad
 * spend. Planted finding:
 *   R14 rate-on-base overbilling: the contract sets the management fee at 12% of
 *       ad spend (feePctOfBase = 0.12), but invoices compute it at 15% of the
 *       $27,250/mo media base. Overcharge = (0.15 - 0.12) x $27,250 x 12
 *       = $817.50/mo x 12 = $9,810/yr.
 */
import { VendorRecordSchema } from "../../types";
import { slug } from "../../docmodel/serialize";
import { usd, makeContract, invoiceSeries, li, NET30 } from "../helpers";
import type { VendorSeed } from "../types";

const name = "PeakRank Digital";
const id = slug(name);
const category = "Marketing (media)";

const adSpendCents = usd(27_250); // monthly paid-media base
const contractedPct = 0.12;
const billedPct = 0.15;
const billedFeeCents = Math.round(adSpendCents * billedPct); // $4,087.50
const contractedFeeCents = Math.round(adSpendCents * contractedPct); // $3,270.00

const contract = makeContract({
  vendorName: name,
  category,
  effectiveDate: "2025-01-01",
  endDate: "2027-06-30", // multi-year term -> R01 does NOT fire
  initialTermMonths: 30,
  autoRenew: true,
  noticeWindowDays: 30,
  governingLaw: "Ohio",
  currentAnnualValueCents: (adSpendCents + contractedFeeCents) * 12,
  payment: NET30,
  feePctOfBase: contractedPct,
  capabilityTags: ["Paid Media", "SEM", "Programmatic"],
  signatory: { name: "Nadia Cole", title: "Director of Growth", date: "2024-12-15" },
});

const series = invoiceSeries({
  vendorId: id,
  vendorName: name,
  fileBase: id,
  start: "2025-07-01",
  count: 12,
  numberPrefix: "PRD-INV",
  poNumber: "PO-NW-1348",
  payment: NET30,
  ein: "47-6620184",
  lines: () => [
    li({
      description: "Paid Media Ad Spend (pass-through base)",
      sku: "MEDIA-SPEND",
      uom: "month",
      qty: 1,
      unitPriceCents: adSpendCents,
      lineType: "other",
    }),
    li({
      description: "Management Fee (15% of media spend)",
      sku: "MGMT-FEE",
      uom: "month",
      qty: 1,
      unitPriceCents: billedFeeCents,
      lineType: "fee",
    }),
  ],
});

const record = VendorRecordSchema.parse({
  vendor: { id, name, category, aliases: ["PeakRank Digital, Inc."] },
  contract,
  invoices: series,
  usage: [],
});

const monthlyOvercharge = billedFeeCents - contractedFeeCents; // $817.50
const seed: VendorSeed = {
  record,
  expected: [
    {
      vendorId: id,
      ruleId: "R14",
      category: "overbilling",
      savingsType: "recovery",
      annualizedSavingsCents: monthlyOvercharge * 12, // $9,810
      recoverableToDateCents: monthlyOvercharge * 12,
      note: "Management fee billed at 15% vs contracted 12% on $27,250/mo ad spend => $817.50/mo overcharge x 12",
    },
  ],
};

export default seed;

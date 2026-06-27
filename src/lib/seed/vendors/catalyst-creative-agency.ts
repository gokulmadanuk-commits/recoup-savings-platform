/**
 * Catalyst Creative Agency — monthly retainer plus out-of-scope (overage) hours.
 * Planted finding (the single LARGEST in the corpus):
 *   R05 overage / usage-tier mismatch: the retainer includes 40 hours/month, but
 *       every invoice bills 65 hours — 25 hours over allowance at the punitive
 *       out-of-scope rate of $185/hr = $4,625/mo. Buying up the retainer
 *       allowance instead of paying the overage rate avoids
 *       25 x $185 x 12 = $55,500/yr.
 */
import { VendorRecordSchema } from "../../types";
import { slug } from "../../docmodel/serialize";
import { usd, makeContract, invoiceSeries, li, NET30 } from "../helpers";
import type { VendorSeed } from "../types";

const name = "Catalyst Creative Agency";
const id = slug(name);
const category = "Marketing/agency";

const includedAllowance = 40; // retainer hours/mo
const billedHours = 65;
const overageHours = billedHours - includedAllowance; // 25
const overageUnitPriceCents = usd(185); // $185/hr out-of-scope rate
const retainerFeeCents = usd(8_000); // flat monthly retainer (covers the 40 hrs)

const contract = makeContract({
  vendorName: name,
  category,
  effectiveDate: "2025-01-01",
  endDate: "2027-06-30", // multi-year term -> R01 does NOT fire
  initialTermMonths: 30,
  autoRenew: true,
  noticeWindowDays: 30,
  governingLaw: "Ohio",
  currentAnnualValueCents: retainerFeeCents * 12,
  payment: NET30,
  commitment: {
    measurementPeriod: "monthly",
    includedAllowance,
    overageUnitPriceCents,
  },
  capabilityTags: ["Creative", "Brand", "Content"],
  signatory: { name: "Theo Brandt", title: "VP Marketing", date: "2024-12-20" },
});

const series = invoiceSeries({
  vendorId: id,
  vendorName: name,
  fileBase: id,
  start: "2025-07-01",
  count: 12,
  numberPrefix: "CCA-INV",
  poNumber: "PO-NW-1335",
  payment: NET30,
  ein: "26-7741093",
  lines: () => [
    li({
      description: "Monthly Creative Retainer (40 hrs included)",
      sku: "RET-CREATIVE",
      uom: "month",
      qty: 1,
      unitPriceCents: retainerFeeCents,
      lineType: "recurring",
    }),
    li({
      description: "Out-of-Scope Hours (over 40-hr retainer allowance)",
      sku: "OOS-HOURS",
      uom: "hour",
      qty: overageHours,
      unitPriceCents: overageUnitPriceCents,
      lineType: "overage",
    }),
  ],
});

const record = VendorRecordSchema.parse({
  vendor: { id, name, category, aliases: ["Catalyst Creative Agency, LLC"] },
  contract,
  invoices: series,
  usage: [],
});

const seed: VendorSeed = {
  record,
  expected: [
    {
      vendorId: id,
      ruleId: "R05",
      category: "tier_optimization",
      savingsType: "avoidance",
      annualizedSavingsCents: overageHours * overageUnitPriceCents * 12, // $55,500
      note: "65 hrs billed vs 40-hr retainer allowance => 25 overage hrs/mo at $185 = $4,625/mo avoidable by buying up the retainer",
    },
  ],
};

export default seed;

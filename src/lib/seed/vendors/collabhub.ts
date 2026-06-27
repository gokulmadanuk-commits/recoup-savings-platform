/**
 * CollabHub Suite — SaaS per-seat collaboration. Planted finding:
 *   R03 unused seats: 250 contracted seats, only 160 active (90 idle) at
 *       $45/seat/mo => $48,600/yr avoidable at renewal. A utilization export
 *       (Excel) is the answer key the rule reads.
 */
import { VendorRecordSchema } from "../../types";
import { slug } from "../../docmodel/serialize";
import { usd, makeContract, invoiceSeries, li, seatUsage, NET30 } from "../helpers";
import type { VendorSeed } from "../types";

const name = "CollabHub Suite";
const id = slug(name);

const contract = makeContract({
  vendorName: name,
  category: "SaaS (per-seat)",
  effectiveDate: "2025-03-01",
  endDate: "2027-02-28",
  initialTermMonths: 24,
  autoRenew: true,
  noticeWindowDays: 30,
  governingLaw: "California",
  currentAnnualValueCents: usd(135_000),
  payment: NET30,
  rateCard: [
    { sku: "COLLAB-SEAT", description: "Standard Seat License", uom: "seat", unitPriceCents: usd(45) },
  ],
  commitment: { contractedSeats: 250, tier: "Standard", tierPricePerSeatCents: usd(45) },
  capabilityTags: ["Messaging", "Collaboration", "Video"],
  signatory: { name: "Marcus Lindqvist", title: "Director of IT", date: "2025-02-10" },
});

const series = invoiceSeries({
  vendorId: id,
  vendorName: name,
  fileBase: id,
  start: "2025-07-01",
  count: 12,
  numberPrefix: "CH-INV",
  poNumber: "PO-NW-1067",
  payment: NET30,
  ein: "47-2093841",
  lines: () => [
    li({ description: "Standard Seat License", sku: "COLLAB-SEAT", uom: "seat", qty: 250, unitPriceCents: usd(45), lineType: "seat" }),
  ],
});

// 250 paid, 160 active => 90 idle (60 inactive + 30 never used).
const usage = seatUsage(id, { active: 160, inactive: 60, neverUsed: 30 });

const record = VendorRecordSchema.parse({
  vendor: { id, name, category: "SaaS (per-seat)", aliases: ["CollabHub, Inc."] },
  contract,
  invoices: series,
  usage,
});

const idleSeats = 90;
const seed: VendorSeed = {
  record,
  expected: [
    {
      vendorId: id,
      ruleId: "R03",
      category: "unused_seats",
      savingsType: "avoidance",
      annualizedSavingsCents: idleSeats * usd(45) * 12,
      note: "90 idle seats of 250 paid at $45/seat/mo",
    },
  ],
};

export default seed;

/**
 * IronRoad Freight — LTL freight, accessorials + fuel.
 * Planted finding:
 *   R12 accessorial leakage: "Residential Delivery" and "Liftgate" accessorial
 *       lines billed on commercial dock deliveries that do not warrant them.
 *       Per month: 2 Residential Delivery @ $145 ($290) + 6 Liftgate @ $142
 *       ($852) = $1,142 of unwarranted accessorials x 12 => $13,704/yr.
 */
import { VendorRecordSchema } from "../../types";
import { slug } from "../../docmodel/serialize";
import { usd, makeContract, invoiceSeries, li, NET30 } from "../helpers";
import type { VendorSeed } from "../types";

const name = "IronRoad Freight";
const id = slug(name);
const category = "Logistics (LTL)";

// Legitimate freight components (commercial dock-to-dock LTL).
const baseFreight = usd(6_800); // monthly linehaul
const fuelSurcharge = usd(1_360); // ~20% FSC on commercial LTL

// Unwarranted accessorials on commercial dock deliveries.
const residentialFee = usd(145);
const liftgateFee = usd(142);
const residentialPerMonth = 2;
const liftgatePerMonth = 6;

const contract = makeContract({
  vendorName: name,
  category,
  effectiveDate: "2024-10-01",
  endDate: "2027-09-30",
  initialTermMonths: 36,
  autoRenew: true,
  noticeWindowDays: 45,
  governingLaw: "Ohio",
  currentAnnualValueCents: (baseFreight + fuelSurcharge) * 12,
  payment: NET30,
  rateCard: [
    { sku: "LTL-LINEHAUL", description: "LTL Linehaul (commercial dock-to-dock)", uom: "month", unitPriceCents: baseFreight },
    { sku: "FSC", description: "Fuel Surcharge", uom: "month", unitPriceCents: fuelSurcharge },
    { sku: "ACC-RES", description: "Residential Delivery Surcharge", uom: "shipment", unitPriceCents: residentialFee },
    { sku: "ACC-LFT", description: "Liftgate Service", uom: "shipment", unitPriceCents: liftgateFee },
  ],
  capabilityTags: ["LTL Freight", "Logistics"],
  signatory: { name: "Marisol Quinn", title: "Logistics Procurement Lead", date: "2024-09-09" },
});

const series = invoiceSeries({
  vendorId: id,
  vendorName: name,
  fileBase: id,
  start: "2025-07-01",
  count: 12, // Jul 2025 .. Jun 2026
  numberPrefix: "IR-INV",
  poNumber: "PO-NW-1348",
  payment: NET30,
  taxRate: 0,
  ein: "31-4471203",
  lines: (m) => [
    li({
      description: "LTL Linehaul (commercial dock-to-dock)",
      sku: "LTL-LINEHAUL",
      uom: "month",
      qty: 1,
      unitPriceCents: baseFreight,
      lineType: "recurring",
      serviceDate: m.monthStart,
    }),
    li({
      description: "Fuel Surcharge",
      sku: "FSC",
      uom: "month",
      qty: 1,
      unitPriceCents: fuelSurcharge,
      lineType: "fee",
      serviceDate: m.monthStart,
    }),
    // Unwarranted: residential surcharge on commercial dock deliveries.
    li({
      description: "Residential Delivery Surcharge",
      sku: "ACC-RES",
      uom: "shipment",
      qty: residentialPerMonth,
      unitPriceCents: residentialFee,
      lineType: "accessorial",
      serviceDate: m.monthStart,
    }),
    // Unwarranted: liftgate on dock-equipped commercial deliveries.
    li({
      description: "Liftgate Service",
      sku: "ACC-LFT",
      uom: "shipment",
      qty: liftgatePerMonth,
      unitPriceCents: liftgateFee,
      lineType: "accessorial",
      serviceDate: m.monthStart,
    }),
  ],
});

const record = VendorRecordSchema.parse({
  vendor: { id, name, category, aliases: ["IronRoad Freight Lines, LLC"] },
  contract,
  invoices: series,
  usage: [],
});

const monthlyAccessorialLeakage =
  residentialFee * residentialPerMonth + liftgateFee * liftgatePerMonth; // $1,142
const annualLeakage = monthlyAccessorialLeakage * 12; // $13,704

const seed: VendorSeed = {
  record,
  expected: [
    {
      vendorId: id,
      ruleId: "R12",
      category: "overbilling",
      savingsType: "recovery",
      annualizedSavingsCents: annualLeakage,
      recoverableToDateCents: annualLeakage,
      note: "Residential ($145 x2) + Liftgate ($142 x6) accessorials on commercial dock deliveries = $1,142/mo x 12",
    },
  ],
};

export default seed;

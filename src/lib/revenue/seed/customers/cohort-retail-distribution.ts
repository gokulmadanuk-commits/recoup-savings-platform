/**
 * Cohort Retail Distribution — PLANTED RL01 (escalator never applied).
 *
 * A 3PL/distribution contract signed Feb 2021 at $480,000/yr with an RPI
 * indexation clause that was never applied: billed flat at $40,000/mo for five
 * years. The correct current run-rate is $662,158.86 (RPI CHAW Jan anchors), so:
 *   arrears (2022-2025) = $438,778.00   uplift (2026) = $182,158.86
 * Five years of silent under-billing → relationship-risk grade B (negotiate the
 * in-window arrears + correct forward), not a clean retroactive claim.
 */
import {
  makeCustomerContract,
  billingSeries,
  bl,
  arAging,
  usd,
} from "../helpers";
import { CustomerRecordSchema } from "../../types";
import type { CustomerSeed } from "../types";

const id = "cohort-retail-distribution";
const name = "Cohort Retail Distribution, LLC";

const contract = makeCustomerContract({
  customerId: id,
  customerName: name,
  segment: "Retail distribution",
  effectiveDate: "2021-02-01",
  endDate: "2027-01-31",
  initialTermMonths: 12,
  autoRenew: true,
  noticeWindowDays: 60,
  governingLaw: "Ohio",
  auditWindowMonths: 24,
  currentAnnualValueCents: usd(480_000),
  payment: { netDays: 45, discountPct: 0, discountDays: 0 },
  escalator: {
    type: "rpi",
    baseIndexYear: 2021,
    anniversaryMonth: 2,
    compounding: true,
  },
  rateCard: [
    {
      sku: "3PL-FEE",
      description: "3PL distribution & fulfillment — monthly service fee",
      uom: "month",
      unitPriceCents: usd(40_000),
    },
  ],
  signatory: { name: "Maria Whitfield", title: "VP Operations", date: "2021-01-20" },
});

const billings = billingSeries({
  customerId: id,
  customerName: name,
  fileBase: id,
  start: "2025-07-01",
  count: 12,
  numberPrefix: "NW-COH-2026",
  poNumber: "PO-COH-3110",
  payment: { netDays: 45, discountPct: 0, discountDays: 0 },
  lines: () => [
    bl({
      description: "3PL distribution & fulfillment — monthly service fee",
      sku: "3PL-FEE",
      uom: "month",
      qty: 1,
      unitPriceCents: usd(40_000),
      lineType: "recurring",
    }),
  ],
});

const ar = arAging(id, [
  { invoiceNumber: "NW-COH-2026-11", invoiceDate: "2026-05-05", ageDays: 8, balanceCents: usd(40_000) },
  { invoiceNumber: "NW-COH-2026-10", invoiceDate: "2026-04-05", ageDays: 39, balanceCents: usd(40_000) },
]);

const record = CustomerRecordSchema.parse({
  customer: { id, name, segment: "Retail distribution", aliases: ["Cohort Retail Dist."] },
  contract,
  billings,
  workOrders: [],
  arAging: ar,
});

const seed: CustomerSeed = {
  record,
  expected: [
    {
      customerId: id,
      ruleId: "RL01",
      category: "escalator_missed",
      recoveryType: "arrears",
      arrearsToDateCents: 43_877_800, // $438,778.00 (2022-2025 shortfalls)
      annualizedUpliftCents: 18_215_886, // $182,158.86 (2026 forward gap)
      totalRecoverableCents: 62_093_686,
      relationshipRisk: "B",
      note: "RPI escalator never applied since 2021; billed flat at $480k/yr.",
    },
  ],
};

export default seed;

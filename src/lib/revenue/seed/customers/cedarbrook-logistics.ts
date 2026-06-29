/**
 * Cedarbrook Logistics Partners — PLANTED RL08 (delivered services never billed).
 *
 * A 3PL buying Northwind's special-handling / expedited freight. Eight discrete
 * jobs were fulfilled in spring 2026 at the contracted unit price of $2,500 each:
 *   - 6 are status "delivered" with NO billing line referencing their work-order
 *     numbers → unbilled, recoverable.
 *   - 2 are status "invoiced" and each HAS a matching billing line (workOrderId
 *     present on the line) → correctly billed, must be excluded.
 *
 * Answer key (by hand):
 *   6 unbilled delivered jobs × $2,500 × qty 1 = $15,000.00
 *     arrears = 6 × usd(2_500) = 6 × 250_000 = 1_500_000 cents  ($15,000.00)
 *     uplift  = 0  (one-time recovery — the work is done)
 *     total   = 1_500_000 cents
 *   Blended fee = round(1_500_000 × 0.3) + round(0 × 0.2) = 450_000 cents
 *   Discrete, recent (Mar–May 2026, well inside the 24-month audit window) and
 *   never silently under-billed for years → relationship-risk grade A.
 */
import {
  makeCustomerContract,
  billingSeries,
  bl,
  workOrders,
  arAging,
  usd,
  NET30,
} from "../helpers";
import { CustomerRecordSchema } from "../../types";
import type { CustomerSeed } from "../types";

const id = "cedarbrook-logistics";
const name = "Cedarbrook Logistics Partners, LLC";
const segment = "3PL";

const UNIT = usd(2_500); // $2,500.00 contracted special-handling unit price

const contract = makeCustomerContract({
  customerId: id,
  customerName: name,
  segment,
  effectiveDate: "2024-03-01",
  endDate: "2027-02-28",
  initialTermMonths: 12,
  autoRenew: true,
  noticeWindowDays: 60,
  governingLaw: "Illinois",
  auditWindowMonths: 24,
  currentAnnualValueCents: usd(360_000),
  payment: NET30,
  rateCard: [
    {
      sku: "SPC-HANDLE",
      description: "Special-handling / expedited freight job",
      uom: "job",
      unitPriceCents: UNIT,
    },
    {
      sku: "3PL-FEE",
      description: "3PL fulfillment — monthly base service fee",
      uom: "month",
      unitPriceCents: usd(30_000),
    },
  ],
  signatory: { name: "Daniel Brooks", title: "Director of Logistics", date: "2024-02-12" },
});

// Two delivered jobs that WERE invoiced — each billing line carries its workOrderId.
const INVOICED = [
  { workOrderId: "WO-CED-2026-001", serviceDate: "2026-02-10" },
  { workOrderId: "WO-CED-2026-002", serviceDate: "2026-02-24" },
];

// Six delivered jobs that were never invoiced (no billing line references them).
const UNBILLED = [
  { workOrderId: "WO-CED-2026-101", serviceDate: "2026-03-05" },
  { workOrderId: "WO-CED-2026-102", serviceDate: "2026-03-19" },
  { workOrderId: "WO-CED-2026-103", serviceDate: "2026-04-02" },
  { workOrderId: "WO-CED-2026-104", serviceDate: "2026-04-21" },
  { workOrderId: "WO-CED-2026-105", serviceDate: "2026-05-08" },
  { workOrderId: "WO-CED-2026-106", serviceDate: "2026-05-26" },
];

const wos = workOrders(id, [
  ...INVOICED.map((w) => ({
    workOrderId: w.workOrderId,
    serviceDate: w.serviceDate,
    description: "Special-handling / expedited freight job",
    sku: "SPC-HANDLE",
    uom: "job",
    qty: 1,
    contractedUnitPriceCents: UNIT,
    status: "invoiced" as const,
  })),
  ...UNBILLED.map((w) => ({
    workOrderId: w.workOrderId,
    serviceDate: w.serviceDate,
    description: "Special-handling / expedited freight job",
    sku: "SPC-HANDLE",
    uom: "job",
    qty: 1,
    contractedUnitPriceCents: UNIT,
    status: "delivered" as const,
  })),
]);

// Monthly billing: the recurring 3PL base fee plus — for the two invoiced jobs —
// a service line that carries the matching workOrderId. The six delivered jobs
// are deliberately absent from billing.
const billings = billingSeries({
  customerId: id,
  customerName: name,
  fileBase: id,
  start: "2025-07-01",
  count: 12,
  numberPrefix: "NW-CED-2026",
  poNumber: "PO-CED-4820",
  payment: NET30,
  lines: (m) => {
    const lines = [
      bl({
        description: "3PL fulfillment — monthly base service fee",
        sku: "3PL-FEE",
        uom: "month",
        qty: 1,
        unitPriceCents: usd(30_000),
        lineType: "recurring",
      }),
    ];
    // February 2026 invoice (m.index 7: 2025-07 + 7 months) carries the two
    // correctly-billed special-handling jobs, each tied to its work order.
    if (m.index === 7) {
      for (const w of INVOICED) {
        lines.push(
          bl({
            description: "Special-handling / expedited freight job",
            sku: "SPC-HANDLE",
            uom: "job",
            qty: 1,
            unitPriceCents: UNIT,
            lineType: "service",
            workOrderId: w.workOrderId,
            serviceDate: w.serviceDate,
          }),
        );
      }
    }
    return lines;
  },
});

const ar = arAging(id, [
  { invoiceNumber: "NW-CED-2026-11", invoiceDate: "2026-05-05", ageDays: 9, balanceCents: usd(30_000) },
  { invoiceNumber: "NW-CED-2026-10", invoiceDate: "2026-04-05", ageDays: 40, balanceCents: usd(30_000) },
]);

const record = CustomerRecordSchema.parse({
  customer: { id, name, segment, aliases: ["Cedarbrook Logistics", "Cedarbrook 3PL"] },
  contract,
  billings,
  workOrders: wos,
  arAging: ar,
});

const seed: CustomerSeed = {
  record,
  expected: [
    {
      customerId: id,
      ruleId: "RL08",
      category: "unbilled_services",
      recoveryType: "arrears",
      arrearsToDateCents: 1_500_000, // $15,000.00 = 6 × $2,500
      annualizedUpliftCents: 0, // one-time recovery
      totalRecoverableCents: 1_500_000,
      relationshipRisk: "A",
      note: "6 delivered special-handling jobs (@$2,500) never invoiced; 2 invoiced jobs correctly excluded.",
    },
  ],
};

export default seed;

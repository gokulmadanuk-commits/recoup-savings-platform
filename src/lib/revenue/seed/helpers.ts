/**
 * Authoring toolkit for the synthetic REVENUE corpus (Northwind as the SELLER).
 * Mirror of ../../seed/helpers, seller-side: billing totals are always computed
 * from lines, dates derive from a single start month, billTo = customer and
 * remitTo = Northwind. Generated relative to ANALYSIS_DATE so the date-sensitive
 * pieces (AR aging, discount expiry, escalator anniversaries) land deterministically.
 */
import { z } from "zod";
import {
  BillingLineSchema,
  BillingDocSchema,
  CustomerContractSchema,
  WorkOrderSchema,
  ARAgingRecordSchema,
  SELLER_NAME,
  type BillingDoc,
  type BillingLine,
  type CustomerContract,
  type WorkOrder,
  type ARAgingRecord,
} from "../types";
import { bucketOf } from "../collections";
import { type Cents, toCents, lineTotalCents } from "../../money";
import { addDays, daysBetween, type ISODate } from "../../dates";
import { ANALYSIS_DATE } from "../../config";
import { slug } from "../../docmodel/serialize";
// Reuse the generic, side-agnostic helpers from the cost toolkit.
import { COMPANY, months, type MonthCtx } from "../../seed/helpers";

export const usd = toCents;
export { months, COMPANY };
export type { MonthCtx };

export const SELLER = {
  name: SELLER_NAME,
  ar: "Northwind Logistics Group, Inc. — Accounts Receivable, 1400 Harbor Point Dr, Columbus, OH 43215",
  contact: "billing@northwindlogistics.com",
} as const;

export const NET30 = { netDays: 30, discountPct: 0, discountDays: 0 } as const;
export const NET45 = { netDays: 45, discountPct: 0, discountDays: 0 } as const;
export const NET60 = { netDays: 60, discountPct: 0, discountDays: 0 } as const;

type ContractInput = z.input<typeof CustomerContractSchema>;

type LineInput = Partial<BillingLine> & {
  description: string;
  qty: number;
  unitPriceCents: Cents;
};

/** Build one billing line; line total is computed unless explicitly overridden. */
export function bl(p: LineInput): BillingLine {
  return BillingLineSchema.parse({
    ...p,
    lineTotalCents: p.lineTotalCents ?? lineTotalCents(p.unitPriceCents, p.qty),
  });
}

export interface BillingSpec {
  customerId: string;
  customerName: string;
  billingNumber: string;
  m: MonthCtx;
  poNumber?: string;
  payment?: BillingDoc["paymentTerms"];
  taxRate?: number;
  paidDate?: ISODate | null;
  fileBase: string;
  lines: BillingLine[];
}

/** Assemble one billing document with subtotal/tax/total derived from the lines. */
export function makeBillingDoc(spec: BillingSpec): BillingDoc {
  const taxable = spec.lines
    .filter(
      (l) =>
        l.lineType !== "tax" &&
        l.lineType !== "discount" &&
        l.lineType !== "credit",
    )
    .reduce((a, l) => a + l.lineTotalCents, 0);
  const adjustments = spec.lines
    .filter((l) => l.lineType === "discount" || l.lineType === "credit")
    .reduce((a, l) => a + l.lineTotalCents, 0);
  const subtotalCents = taxable + adjustments;
  const taxCents = spec.taxRate ? Math.round(taxable * spec.taxRate) : 0;
  return BillingDocSchema.parse({
    id: spec.billingNumber,
    customerId: spec.customerId,
    customerName: spec.customerName,
    sourceDoc: `${spec.fileBase}-billing-${spec.m.ym}.pdf`,
    billingNumber: spec.billingNumber,
    invoiceDate: spec.m.invoiceDate,
    dueDate: spec.m.dueDate,
    poNumber: spec.poNumber ?? null,
    billingPeriodStart: spec.m.monthStart,
    billingPeriodEnd: spec.m.monthEnd,
    billTo: spec.customerName,
    remitTo: SELLER.name,
    paymentTerms: spec.payment ?? NET30,
    paidDate: spec.paidDate ?? null,
    subtotalCents,
    taxCents,
    totalCents: subtotalCents + taxCents,
    lines: spec.lines,
  });
}

export interface BillingSeriesSpec {
  customerId: string;
  customerName: string;
  fileBase: string;
  start: ISODate;
  count: number;
  numberPrefix: string; // e.g. "NW-2026" -> "NW-2026-08"
  poNumber?: string;
  payment?: BillingDoc["paymentTerms"];
  taxRate?: number;
  /** Lines for month `m`. Inject the planted anomaly via conditionals on m.index. */
  lines: (m: MonthCtx) => BillingLine[];
  /** Optional: when the customer actually paid month m (null = open). */
  paidDate?: (m: MonthCtx) => ISODate | null;
}

/** A run of monthly billing documents for one customer. */
export function billingSeries(spec: BillingSeriesSpec): BillingDoc[] {
  const netDays = (spec.payment ?? NET30).netDays;
  return months(spec.start, spec.count, netDays).map((m) =>
    makeBillingDoc({
      customerId: spec.customerId,
      customerName: spec.customerName,
      billingNumber: `${spec.numberPrefix}-${String(m.index + 1).padStart(2, "0")}`,
      m,
      poNumber: spec.poNumber,
      payment: spec.payment,
      taxRate: spec.taxRate,
      fileBase: spec.fileBase,
      paidDate: spec.paidDate ? spec.paidDate(m) : null,
      lines: spec.lines(m),
    }),
  );
}

/** A customer contract with sane seller-side defaults; override what matters. */
export function makeCustomerContract(
  partial: Partial<ContractInput> & {
    customerName: string;
    segment: string;
    effectiveDate: ISODate;
    endDate: ISODate;
    currentAnnualValueCents: Cents;
  },
): CustomerContract {
  const customerId = partial.customerId ?? slug(partial.customerName);
  const fileBase = slug(partial.customerName);
  return CustomerContractSchema.parse({
    ...partial,
    id: partial.id ?? `MSA-${customerId.toUpperCase()}`,
    customerId,
    sourceDoc: partial.sourceDoc ?? `${fileBase}-contract.pdf`,
    seller: SELLER.name,
    initialTermMonths: partial.initialTermMonths ?? 12,
    autoRenew: partial.autoRenew ?? true,
    noticeWindowDays: partial.noticeWindowDays ?? 30,
    renewalTermMonths: partial.renewalTermMonths ?? 12,
    payment: partial.payment ?? NET30,
  });
}

export interface ARRowInput {
  invoiceNumber: string;
  invoiceDate: ISODate;
  /** Days past due as of ANALYSIS_DATE; dueDate is derived from it. */
  ageDays: number;
  balanceCents: Cents;
  disputed?: boolean;
  promiseToPayDate?: ISODate | null;
  promiseBroken?: boolean;
  partialPayment?: boolean;
  priorWriteOffs?: number;
}

/** Build AR aging rows; bucket and dueDate derive from ageDays + ANALYSIS_DATE. */
export function arAging(customerId: string, rows: ARRowInput[]): ARAgingRecord[] {
  return rows.map((r) =>
    ARAgingRecordSchema.parse({
      customerId,
      invoiceNumber: r.invoiceNumber,
      invoiceDate: r.invoiceDate,
      dueDate: addDays(ANALYSIS_DATE, -r.ageDays),
      balanceCents: r.balanceCents,
      ageDays: r.ageDays,
      bucket: bucketOf(r.ageDays),
      disputed: r.disputed ?? false,
      promiseToPayDate: r.promiseToPayDate ?? null,
      promiseBroken: r.promiseBroken ?? false,
      partialPayment: r.partialPayment ?? false,
      priorWriteOffs: r.priorWriteOffs ?? 0,
    }),
  );
}

export interface WorkOrderInput {
  workOrderId: string;
  serviceDate: ISODate;
  description: string;
  sku?: string | null;
  uom?: string;
  qty: number;
  contractedUnitPriceCents: Cents;
  status?: "delivered" | "invoiced" | "cancelled";
}

export function workOrders(
  customerId: string,
  rows: WorkOrderInput[],
): WorkOrder[] {
  return rows.map((r) =>
    WorkOrderSchema.parse({
      customerId,
      workOrderId: r.workOrderId,
      serviceDate: r.serviceDate,
      description: r.description,
      sku: r.sku ?? null,
      uom: r.uom ?? "each",
      qty: r.qty,
      contractedUnitPriceCents: r.contractedUnitPriceCents,
      status: r.status ?? "delivered",
    }),
  );
}

/** Months of under-billing from a contract start to the analysis date (risk axes). */
export function monthsElapsedSince(startISO: ISODate): number {
  return Math.max(0, Math.round(daysBetween(startISO, ANALYSIS_DATE) / 30.44));
}

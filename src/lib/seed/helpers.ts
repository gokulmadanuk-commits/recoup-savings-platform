/**
 * Authoring toolkit for the synthetic corpus. These helpers expand a compact
 * per-vendor spec into a fully-consistent VendorRecord: invoice totals are
 * always computed from line items (never hand-typed), dates derive from a
 * single start month, and everything validates against the canonical schema.
 *
 * The corpus is generated relative to ANALYSIS_DATE so the date-sensitive rules
 * (auto-renewal windows) land deterministically.
 */
import { z } from "zod";
import {
  InvoiceLineSchema,
  InvoiceSchema,
  ContractSchema,
  type Invoice,
  type InvoiceLine,
  type Contract,
  type UsageRecord,
  type PaymentTerm,
} from "../types";

/** Pre-parse contract shape: fields with schema defaults are optional here. */
type ContractInput = z.input<typeof ContractSchema>;
import { type Cents, toCents, lineTotalCents } from "../money";
import { addDays, addMonths, monthKey, type ISODate } from "../dates";
import { slug } from "../docmodel/serialize";

export const usd = toCents;

export const COMPANY = {
  name: "Northwind Logistics Group, Inc.",
  ap: "Northwind Logistics Group, Inc. — Accounts Payable, 1400 Harbor Point Dr, Columbus, OH 43215",
  contact: "ap@northwindlogistics.com",
} as const;

export const NET30: PaymentTerm = { netDays: 30, discountPct: 0, discountDays: 0 };
export const NET45: PaymentTerm = { netDays: 45, discountPct: 0, discountDays: 0 };
export const TERMS_2_10_NET30: PaymentTerm = {
  netDays: 30,
  discountPct: 0.02,
  discountDays: 10,
};

export interface MonthCtx {
  index: number;
  monthStart: ISODate;
  monthEnd: ISODate;
  invoiceDate: ISODate;
  dueDate: ISODate;
  ym: string; // "2025-08"
}

/** `count` consecutive months starting at `startISO` (which must be a 1st). */
export function months(startISO: ISODate, count: number, netDays = 30): MonthCtx[] {
  const out: MonthCtx[] = [];
  for (let i = 0; i < count; i++) {
    const monthStart = addMonths(startISO, i);
    const monthEnd = addDays(addMonths(monthStart, 1), -1);
    const invoiceDate = addDays(monthStart, 4);
    out.push({
      index: i,
      monthStart,
      monthEnd,
      invoiceDate,
      dueDate: addDays(invoiceDate, netDays),
      ym: monthKey(monthStart),
    });
  }
  return out;
}

type LineInput = Partial<InvoiceLine> & {
  description: string;
  qty: number;
  unitPriceCents: Cents;
};

/** Build one invoice line; line total is computed unless explicitly overridden. */
export function li(p: LineInput): InvoiceLine {
  return InvoiceLineSchema.parse({
    ...p,
    lineTotalCents: p.lineTotalCents ?? lineTotalCents(p.unitPriceCents, p.qty),
  });
}

export interface InvoiceSpec {
  vendorId: string;
  vendorName: string;
  invoiceNumber: string;
  m: MonthCtx;
  poNumber?: string;
  payment?: PaymentTerm;
  taxRate?: number;
  actualPayDate?: ISODate | null;
  fileBase: string;
  ein?: string;
  remitTo?: string;
  lines: InvoiceLine[];
}

/** Assemble one invoice with subtotal/tax/total derived from the lines. */
export function makeInvoice(spec: InvoiceSpec): Invoice {
  const taxableSubtotal = spec.lines
    .filter((l) => l.lineType !== "tax" && l.lineType !== "credit")
    .reduce((a, l) => a + l.lineTotalCents, 0);
  const creditsAndOther = spec.lines
    .filter((l) => l.lineType === "credit")
    .reduce((a, l) => a + l.lineTotalCents, 0);
  const subtotalCents = taxableSubtotal + creditsAndOther;
  const taxCents = spec.taxRate ? Math.round(taxableSubtotal * spec.taxRate) : 0;
  return InvoiceSchema.parse({
    id: spec.invoiceNumber,
    vendorId: spec.vendorId,
    vendorName: spec.vendorName,
    sourceDoc: `${spec.fileBase}-invoice-${spec.m.ym}.pdf`,
    invoiceNumber: spec.invoiceNumber,
    invoiceDate: spec.m.invoiceDate,
    dueDate: spec.m.dueDate,
    poNumber: spec.poNumber ?? null,
    billingPeriodStart: spec.m.monthStart,
    billingPeriodEnd: spec.m.monthEnd,
    billTo: COMPANY.ap,
    remitTo: spec.remitTo ?? spec.vendorName,
    ein: spec.ein ?? null,
    paymentTerms: spec.payment ?? NET30,
    actualPayDate: spec.actualPayDate ?? null,
    subtotalCents,
    taxCents,
    totalCents: subtotalCents + taxCents,
    lines: spec.lines,
  });
}

export interface SeriesSpec {
  vendorId: string;
  vendorName: string;
  fileBase: string;
  start: ISODate;
  count: number;
  numberPrefix: string; // e.g. "BS-2026" -> "BS-2026-08"
  poNumber?: string;
  payment?: PaymentTerm;
  taxRate?: number;
  ein?: string;
  remitTo?: string;
  /** Lines for month `m`. Inject anomalies via conditionals on m.index. */
  lines: (m: MonthCtx) => InvoiceLine[];
  /** Optional: actual pay date for month m (for missed early-pay rules). */
  payDate?: (m: MonthCtx) => ISODate | null;
}

/** A run of monthly invoices for one vendor. */
export function invoiceSeries(spec: SeriesSpec): Invoice[] {
  const netDays = (spec.payment ?? NET30).netDays;
  return months(spec.start, spec.count, netDays).map((m) =>
    makeInvoice({
      vendorId: spec.vendorId,
      vendorName: spec.vendorName,
      invoiceNumber: `${spec.numberPrefix}-${String(m.index + 1).padStart(2, "0")}`,
      m,
      poNumber: spec.poNumber,
      payment: spec.payment,
      taxRate: spec.taxRate,
      ein: spec.ein,
      remitTo: spec.remitTo,
      fileBase: spec.fileBase,
      actualPayDate: spec.payDate ? spec.payDate(m) : null,
      lines: spec.lines(m),
    }),
  );
}

/** A contract with sane defaults; pass overrides for the parts that matter. */
export function makeContract(
  partial: Partial<ContractInput> & {
    vendorName: string;
    category: string;
    effectiveDate: ISODate;
    endDate: ISODate;
    currentAnnualValueCents: Cents;
  },
): Contract {
  const vendorId = partial.vendorId ?? slug(partial.vendorName);
  const fileBase = slug(partial.vendorName);
  return ContractSchema.parse({
    ...partial,
    id: partial.id ?? `MSA-${vendorId.toUpperCase()}`,
    vendorId,
    sourceDoc: partial.sourceDoc ?? `${fileBase}-contract.pdf`,
    customer: COMPANY.name,
    initialTermMonths: partial.initialTermMonths ?? 12,
    autoRenew: partial.autoRenew ?? true,
    noticeWindowDays: partial.noticeWindowDays ?? 30,
    renewalTermMonths: partial.renewalTermMonths ?? 12,
    payment: partial.payment ?? NET30,
  });
}

/** Per-seat utilization export: active / inactive / never-used users. */
export function seatUsage(
  vendorId: string,
  opts: { active: number; inactive: number; neverUsed: number; lastActiveActive?: ISODate; lastActiveInactive?: ISODate },
): UsageRecord[] {
  const recs: UsageRecord[] = [];
  let n = 0;
  const mk = (status: UsageRecord["status"], lastActiveDate: ISODate | null): UsageRecord => ({
    vendorId,
    kind: "seat",
    identifier: `user${String(++n).padStart(3, "0")}@northwindlogistics.com`,
    status,
    lastActiveDate,
    provisioned: true,
    feature: null,
    used: null,
    tier: null,
    period: null,
    count: null,
    decommissionDate: null,
  });
  for (let i = 0; i < opts.active; i++) recs.push(mk("active", opts.lastActiveActive ?? "2026-06-18"));
  for (let i = 0; i < opts.inactive; i++) recs.push(mk("inactive", opts.lastActiveInactive ?? "2026-01-15"));
  for (let i = 0; i < opts.neverUsed; i++) recs.push(mk("never_used", null));
  return recs;
}

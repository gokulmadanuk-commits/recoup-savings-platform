/**
 * Canonical domain model. Detection rules NEVER read raw documents — they read
 * this normalized, zod-validated shape. Everything is JSON-serializable (ISO
 * date strings, integer cents) so it round-trips through the API and
 * ground-truth fixtures unchanged.
 */
import { z } from "zod";

/** Integer cents (see money.ts). */
const Cents = z.number().int();
const ISODateStr = z.string(); // "YYYY-MM-DD"

export const BillingPeriodSchema = z.enum([
  "monthly",
  "quarterly",
  "annual",
  "one_time",
]);

/* ------------------------------------------------------------------ */
/* Vendor                                                              */
/* ------------------------------------------------------------------ */

export const VendorSchema = z.object({
  id: z.string(),
  name: z.string(),
  category: z.string(),
  /** Alternate legal names used for entity-normalized matching (R06). */
  aliases: z.array(z.string()).default([]),
});
export type Vendor = z.infer<typeof VendorSchema>;

/* ------------------------------------------------------------------ */
/* Contract sub-terms                                                  */
/* ------------------------------------------------------------------ */

export const RateCardLineSchema = z.object({
  sku: z.string(),
  description: z.string(),
  /** seat | envelope | GB | hour | unit | line | click | flat | each ... */
  uom: z.string(),
  unitPriceCents: Cents,
  currency: z.string().default("USD"),
  effectiveFrom: ISODateStr.nullable().default(null),
  effectiveTo: ISODateStr.nullable().default(null),
  /** Volume-tier bounds (R07) — null when not tiered. */
  tierMin: z.number().nullable().default(null),
  tierMax: z.number().nullable().default(null),
  tierBaseFeeCents: Cents.nullable().default(null),
});
export type RateCardLine = z.infer<typeof RateCardLineSchema>;

export const EscalatorTermSchema = z.object({
  type: z.enum(["fixed", "cpi", "cpi_plus", "greater_of", "none"]),
  /** Fixed annual uplift as a fraction (0.04 = 4%). */
  fixedPct: z.number().nullable().default(null),
  cpiPlusPct: z.number().nullable().default(null),
  /** Contractual ceiling on any uplift (the cap that R04 enforces). */
  capPct: z.number().nullable().default(null),
  anniversaryMonth: z.number().int().min(1).max(12).nullable().default(null),
});
export type EscalatorTerm = z.infer<typeof EscalatorTermSchema>;

export const CommitmentTermSchema = z.object({
  minCommitSpendCents: Cents.nullable().default(null),
  minCommitQty: z.number().nullable().default(null),
  measurementPeriod: BillingPeriodSchema.default("annual"),
  /** Bundled allowance before overage applies (R05). */
  includedAllowance: z.number().nullable().default(null),
  overageUnitPriceCents: Cents.nullable().default(null),
  /** Seat/plan terms (R03/R10). */
  contractedSeats: z.number().int().nullable().default(null),
  tier: z.string().nullable().default(null),
  tierPricePerSeatCents: Cents.nullable().default(null),
});
export type CommitmentTerm = z.infer<typeof CommitmentTermSchema>;

export const PaymentTermSchema = z.object({
  netDays: z.number().int(),
  /** Early-pay discount as a fraction (0.02 for "2/10 net 30"). */
  discountPct: z.number().default(0),
  discountDays: z.number().int().default(0),
});
export type PaymentTerm = z.infer<typeof PaymentTermSchema>;

export const TieredRateSchema = z.object({
  tierMin: z.number(),
  tierMax: z.number().nullable().default(null),
  baseFeeCents: Cents.default(0),
  unitPriceCents: Cents,
  overageRateCents: Cents.nullable().default(null),
});
export type TieredRate = z.infer<typeof TieredRateSchema>;

/* ------------------------------------------------------------------ */
/* Contract                                                            */
/* ------------------------------------------------------------------ */

export const ContractSchema = z.object({
  id: z.string(),
  vendorId: z.string(),
  vendorName: z.string(),
  category: z.string(),
  sourceDoc: z.string(),
  customer: z.string(),

  effectiveDate: ISODateStr,
  endDate: ISODateStr,
  initialTermMonths: z.number().int(),
  autoRenew: z.boolean(),
  noticeWindowDays: z.number().int().default(0),
  noticeMethod: z.string().nullable().default(null),
  renewalTermMonths: z.number().int().default(12),
  earlyTermFeeCents: Cents.default(0),
  governingLaw: z.string().nullable().default(null),

  currentAnnualValueCents: Cents,

  rateCard: z.array(RateCardLineSchema).default([]),
  tiers: z.array(TieredRateSchema).default([]),
  escalator: EscalatorTermSchema.nullable().default(null),
  commitment: CommitmentTermSchema.nullable().default(null),
  payment: PaymentTermSchema,

  /* Category-specific extras (populated only where relevant) */
  /** Functional capability tags for cross-vendor overlap (R13). */
  capabilityTags: z.array(z.string()).default([]),
  /** Contracted weekly hours for labor schedules (R12). */
  scheduledHoursPerWeek: z.number().nullable().default(null),
  /** ISO dates the contract treats as billable holidays (R12). */
  holidayCalendar: z.array(ISODateStr).default([]),
  /** Seasonal service windows by month (R12). */
  seasonWindows: z
    .array(
      z.object({
        service: z.string(),
        startMonth: z.number().int().min(1).max(12),
        endMonth: z.number().int().min(1).max(12),
      }),
    )
    .default([]),
  /** Which tier first unlocks each premium feature (R10). */
  featureCatalog: z
    .array(z.object({ feature: z.string(), minTier: z.string() }))
    .default([]),
  /** % of a defined base, e.g. agency management fee (R14). */
  feePctOfBase: z.number().nullable().default(null),
  /** Per-employee-per-month rate in cents (R14). */
  pepmRateCents: Cents.nullable().default(null),

  signatory: z
    .object({ name: z.string(), title: z.string(), date: ISODateStr })
    .nullable()
    .default(null),
});
export type Contract = z.infer<typeof ContractSchema>;

/* ------------------------------------------------------------------ */
/* Invoice                                                             */
/* ------------------------------------------------------------------ */

export const InvoiceLineSchema = z.object({
  sku: z.string().nullable().default(null),
  description: z.string(),
  uom: z.string().default("each"),
  qty: z.number(),
  unitPriceCents: Cents,
  lineTotalCents: Cents,
  lineType: z
    .enum([
      "recurring",
      "usage",
      "overage",
      "seat",
      "labor",
      "accessorial",
      "fee",
      "credit",
      "tax",
      "other",
    ])
    .default("other"),
  /** Circuit / meter / leased-unit / wireless-line id (R11). */
  assetId: z.string().nullable().default(null),
  periodStart: ISODateStr.nullable().default(null),
  periodEnd: ISODateStr.nullable().default(null),
  /** Labor classification for overbilling checks (R12). */
  laborType: z.enum(["regular", "ot", "holiday"]).nullable().default(null),
  serviceDate: ISODateStr.nullable().default(null),
});
export type InvoiceLine = z.infer<typeof InvoiceLineSchema>;

export const InvoiceSchema = z.object({
  id: z.string(),
  vendorId: z.string(),
  vendorName: z.string(),
  sourceDoc: z.string(),

  invoiceNumber: z.string(),
  invoiceDate: ISODateStr,
  dueDate: ISODateStr.nullable().default(null),
  poNumber: z.string().nullable().default(null),
  billingPeriodStart: ISODateStr.nullable().default(null),
  billingPeriodEnd: ISODateStr.nullable().default(null),
  billTo: z.string().nullable().default(null),
  remitTo: z.string().nullable().default(null),
  ein: z.string().nullable().default(null),
  currency: z.string().default("USD"),

  lines: z.array(InvoiceLineSchema),
  subtotalCents: Cents,
  taxCents: Cents.default(0),
  totalCents: Cents,

  paymentTerms: PaymentTermSchema.nullable().default(null),
  /** When AP actually paid (R08 retrospective). */
  actualPayDate: ISODateStr.nullable().default(null),
});
export type Invoice = z.infer<typeof InvoiceSchema>;

/* ------------------------------------------------------------------ */
/* Usage / utilization records (the "third data source")              */
/* ------------------------------------------------------------------ */

export const UsageRecordSchema = z.object({
  vendorId: z.string(),
  kind: z.enum([
    "seat",
    "line",
    "circuit",
    "meter",
    "unit",
    "feature",
    "headcount",
  ]),
  /** user email / line number / circuit id / feature name / period key. */
  identifier: z.string(),
  lastActiveDate: ISODateStr.nullable().default(null),
  provisioned: z.boolean().default(true),
  status: z
    .enum(["active", "inactive", "decommissioned", "returned", "never_used"])
    .nullable()
    .default(null),
  decommissionDate: ISODateStr.nullable().default(null),

  /* feature-usage variant (R10) */
  feature: z.string().nullable().default(null),
  used: z.boolean().nullable().default(null),
  tier: z.string().nullable().default(null),

  /* headcount variant (R14) */
  period: z.string().nullable().default(null), // "YYYY-MM"
  count: z.number().nullable().default(null),
});
export type UsageRecord = z.infer<typeof UsageRecordSchema>;

/* ------------------------------------------------------------------ */
/* Canonical dataset                                                   */
/* ------------------------------------------------------------------ */

export const VendorRecordSchema = z.object({
  vendor: VendorSchema,
  contract: ContractSchema.nullable().default(null),
  invoices: z.array(InvoiceSchema).default([]),
  usage: z.array(UsageRecordSchema).default([]),
});
export type VendorRecord = z.infer<typeof VendorRecordSchema>;

export const DatasetSchema = z.object({
  customer: z.string(),
  analysisDate: ISODateStr,
  vendors: z.array(VendorRecordSchema),
});
export type Dataset = z.infer<typeof DatasetSchema>;

/* ------------------------------------------------------------------ */
/* DocModel — the format-agnostic document intermediate.              */
/* Generators render DocModel -> file; parsers reconstruct file ->     */
/* DocModel. The label/column names here ARE the layout contract.      */
/* ------------------------------------------------------------------ */

export const DocTableSchema = z.object({
  name: z.string(),
  columns: z.array(z.string()),
  rows: z.array(z.array(z.string())),
});
export type DocTable = z.infer<typeof DocTableSchema>;

export const DocFieldSchema = z.object({
  label: z.string(),
  value: z.string(),
});
export type DocField = z.infer<typeof DocFieldSchema>;

export const DocModelSchema = z.object({
  docType: z.enum(["contract", "invoice", "usage_export"]),
  format: z.enum(["pdf", "excel", "word"]),
  vendorName: z.string(),
  title: z.string(),
  /** Ordered labelled key/values (e.g. "Invoice Number" -> "VND-2026-0042"). */
  fields: z.array(DocFieldSchema).default([]),
  tables: z.array(DocTableSchema).default([]),
  /** Contract prose, by heading (e.g. "Auto-Renewal"). */
  clauses: z
    .array(z.object({ heading: z.string(), body: z.string() }))
    .default([]),
  fileName: z.string(),
});
export type DocModel = z.infer<typeof DocModelSchema>;

export const ParsedDocumentSchema = DocModelSchema.extend({
  /** 0..1 overall parse confidence (source quality + cross-checks). */
  parseConfidence: z.number().default(1),
  warnings: z.array(z.string()).default([]),
  parseStatus: z.enum(["ok", "partial", "failed"]).default("ok"),
});
export type ParsedDocument = z.infer<typeof ParsedDocumentSchema>;

/* ------------------------------------------------------------------ */
/* Findings                                                            */
/* ------------------------------------------------------------------ */

export const SavingsType = z.enum(["recovery", "avoidance"]);
export type SavingsTypeT = z.infer<typeof SavingsType>;

export const FindingCategory = z.enum([
  "auto_renewal",
  "rate_mismatch",
  "unused_seats",
  "price_escalator",
  "overbilling",
  "duplicate",
  "missed_discount",
  "tier_optimization",
  "minimum_commit",
  "other",
]);
export type FindingCategoryT = z.infer<typeof FindingCategory>;

export const EvidenceSchema = z.object({
  label: z.string(),
  value: z.string(),
  sourceDoc: z.string().nullable().default(null),
});
export type Evidence = z.infer<typeof EvidenceSchema>;

export const FindingSchema = z.object({
  id: z.string(),
  ruleId: z.string(),
  ruleName: z.string(),
  category: FindingCategory,
  vendorId: z.string(),
  vendorName: z.string(),

  title: z.string(),
  summary: z.string(),

  savingsType: SavingsType,
  /** Comparable annualized savings — the primary ranking key. */
  annualizedSavingsCents: Cents,
  /** Cash already overpaid that is recoverable now (recovery findings). */
  recoverableToDateCents: Cents.default(0),
  /** Exposure if an auto-renewal window is missed (R01). */
  atRiskCents: Cents.default(0),

  feeRate: z.number(),
  estimatedFeeCents: Cents,

  confidence: z.number(),
  severity: z
    .enum(["critical", "urgent", "high", "medium", "watch"])
    .default("medium"),

  leverage: z.string(),
  evidence: z.array(EvidenceSchema).default([]),
  recommendedAsk: z.string().nullable().default(null),
  /** Notice/action deadline where one applies (R01, R08). */
  deadlineDate: ISODateStr.nullable().default(null),
});
export type Finding = z.infer<typeof FindingSchema>;

/* ------------------------------------------------------------------ */
/* Email drafts                                                        */
/* ------------------------------------------------------------------ */

export const EmailDraftSchema = z.object({
  findingId: z.string(),
  vendorName: z.string(),
  to: z.string(),
  subject: z.string(),
  body: z.string(),
  category: z.string(),
});
export type EmailDraft = z.infer<typeof EmailDraftSchema>;

/* ------------------------------------------------------------------ */
/* Analysis result (what the API returns to the UI)                    */
/* ------------------------------------------------------------------ */

export const AnalysisSummarySchema = z.object({
  customer: z.string(),
  analysisDate: ISODateStr,
  documentsProcessed: z.number().int(),
  documentsFailed: z.number().int(),
  vendorsAnalyzed: z.number().int(),
  vendorsWithFindings: z.number().int().default(0),
  totalAnnualSpendCents: Cents,
  totalAnnualizedSavingsCents: Cents,
  totalRecoverableCents: Cents,
  totalAvoidanceCents: Cents,
  estimatedFeeCents: Cents,
  findingCount: z.number().int(),
});
export type AnalysisSummary = z.infer<typeof AnalysisSummarySchema>;

/** Savings rolled up by finding category (powers the dashboard breakdown). */
export const CategorySummarySchema = z.object({
  category: FindingCategory,
  label: z.string(),
  count: z.number().int(),
  savingsCents: Cents,
  recoverableCents: Cents.default(0),
  avoidanceCents: Cents.default(0),
});
export type CategorySummary = z.infer<typeof CategorySummarySchema>;

/** Per-vendor rollup (powers the vendor leaderboard / drill-down). */
export const VendorSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  category: z.string(),
  annualSpendCents: Cents,
  savingsCents: Cents,
  recoverableCents: Cents.default(0),
  avoidanceCents: Cents.default(0),
  findingCount: z.number().int(),
});
export type VendorSummary = z.infer<typeof VendorSummarySchema>;

/** A source document in the portfolio (powers the documents + clauses viewer). */
export const DocumentSummarySchema = z.object({
  vendorId: z.string(),
  vendorName: z.string(),
  docType: z.enum(["contract", "invoice", "usage_export"]),
  format: z.enum(["pdf", "excel", "word"]),
  fileName: z.string(),
  /** Download path for the sample corpus; null for live uploads. */
  path: z.string().nullable().default(null),
  sizeBytes: z.number().int().nullable().default(null),
  clauses: z
    .array(z.object({ heading: z.string(), body: z.string() }))
    .default([]),
});
export type DocumentSummary = z.infer<typeof DocumentSummarySchema>;

export const AnalysisResultSchema = z.object({
  summary: AnalysisSummarySchema,
  findings: z.array(FindingSchema),
  drafts: z.array(EmailDraftSchema).default([]),
  categories: z.array(CategorySummarySchema).default([]),
  vendors: z.array(VendorSummarySchema).default([]),
  documents: z.array(DocumentSummarySchema).default([]),
});
export type AnalysisResult = z.infer<typeof AnalysisResultSchema>;

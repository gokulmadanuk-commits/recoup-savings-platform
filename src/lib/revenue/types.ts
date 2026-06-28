/**
 * Canonical REVENUE-LEAKAGE (seller-side) domain model — the inverse of the
 * cost-side model in ../types. Where the cost engine finds money a buyer
 * OVERPAYS vendors, this finds money a seller's CUSTOMERS UNDERPAY it: contracted
 * commercial terms (escalators, tiers, price steps, discount expiry, minimums,
 * surcharges) reconciled against what was actually billed + AR aging.
 *
 * Same disciplines as the cost model: JSON-serializable (ISO date strings,
 * integer cents), zod-validated, authored via z.input. Shared sub-term
 * primitives (rate cards, tiers, commitments, payment terms, evidence, email
 * drafts) are imported from ../types — never redefined.
 */
import { z } from "zod";
import {
  RateCardLineSchema,
  TieredRateSchema,
  CommitmentTermSchema,
  PaymentTermSchema,
  BillingPeriodSchema,
  EvidenceSchema,
  EmailDraftSchema,
} from "../types";

/** Integer cents (see ../money). */
const Cents = z.number().int();
const ISODateStr = z.string(); // "YYYY-MM-DD"

export const SELLER_NAME = "Northwind Logistics Group, Inc.";

/* ------------------------------------------------------------------ */
/* Customer (← Vendor)                                                 */
/* ------------------------------------------------------------------ */

export const CustomerSchema = z.object({
  id: z.string(),
  name: z.string(),
  /** "Retail distribution" | "3PL" | "Warehousing" | "Manufacturing" ... */
  segment: z.string(),
  /** Alternate legal/trading names for entity-normalized matching. */
  aliases: z.array(z.string()).default([]),
});
export type Customer = z.infer<typeof CustomerSchema>;

/* ------------------------------------------------------------------ */
/* Seller-side commercial sub-terms                                    */
/* ------------------------------------------------------------------ */

/**
 * Richer escalator than the cost-side EscalatorTerm: supports RPI as well as
 * CPI, a collar (cap AND floor), an indexation base year, publication lag, and
 * compounding — everything the escalator engine (./escalator) needs to compute a
 * multi-year catch-up. Drives RL01.
 */
export const RevenueEscalatorSchema = z.object({
  type: z.enum([
    "fixed",
    "cpi",
    "rpi",
    "cpi_plus",
    "rpi_plus",
    "greater_of",
    "none",
  ]),
  /** Fixed annual uplift as a fraction (0.04). Also the floor leg of "greater_of". */
  fixedPct: z.number().nullable().default(null),
  /** Margin added on top of the index for cpi_plus / rpi_plus (0.01 = +1%). */
  indexPlusPct: z.number().nullable().default(null),
  /** Collar ceiling on any single anniversary uplift. */
  capPct: z.number().nullable().default(null),
  /** Collar floor on any single anniversary uplift. */
  floorPct: z.number().nullable().default(null),
  /** Calendar month (1-12) the uplift takes effect each year. */
  anniversaryMonth: z.number().int().min(1).max(12).nullable().default(null),
  /** Reference year whose index value is the escalation base. */
  baseIndexYear: z.number().int().nullable().default(null),
  /** Index-linked-with-fixed-base is inherently compounding; per-step collars need it explicit. */
  compounding: z.boolean().default(true),
});
export type RevenueEscalator = z.infer<typeof RevenueEscalatorSchema>;

/** A scheduled list-price step (RL02): on/after `effectiveDate`, the rate should rise. */
export const PriceStepSchema = z.object({
  effectiveDate: ISODateStr,
  newUnitPriceCents: Cents,
  sku: z.string().nullable().default(null),
  note: z.string().nullable().default(null),
});
export type PriceStep = z.infer<typeof PriceStepSchema>;

/** A time-boxed introductory/promotional discount (RL03). */
export const IntroDiscountSchema = z.object({
  /** Discount as a fraction (0.15 = 15%). */
  pct: z.number(),
  expiryDate: ISODateStr,
  appliesToSku: z.string().nullable().default(null),
});
export type IntroDiscount = z.infer<typeof IntroDiscountSchema>;

/** A contractual pass-through / surcharge the seller is entitled to bill (RL07). */
export const SurchargeTermSchema = z.object({
  kind: z.enum(["fuel", "fx", "index", "other"]),
  label: z.string(),
  /** Human description of the source/formula (e.g. "EIA on-highway diesel, monthly"). */
  basis: z.string(),
  /** Surcharge as a fraction of the base line (0.085). */
  ratePct: z.number().nullable().default(null),
  /** Or a flat per-unit amount. */
  perUnitCents: Cents.nullable().default(null),
});
export type SurchargeTerm = z.infer<typeof SurchargeTermSchema>;

/* ------------------------------------------------------------------ */
/* Customer contract (← Contract), seller-side                         */
/* ------------------------------------------------------------------ */

export const CustomerContractSchema = z.object({
  id: z.string(),
  customerId: z.string(),
  customerName: z.string(),
  segment: z.string(),
  sourceDoc: z.string(),
  /** Always the seller (Northwind). Distinguishes a customer_contract on parse. */
  seller: z.string().default(SELLER_NAME),

  effectiveDate: ISODateStr,
  endDate: ISODateStr,
  initialTermMonths: z.number().int(),
  autoRenew: z.boolean(),
  noticeWindowDays: z.number().int().default(0),
  noticeMethod: z.string().nullable().default(null),
  renewalTermMonths: z.number().int().default(12),
  governingLaw: z.string().nullable().default(null),
  /** Contractual audit / true-up lookback (months) — relationship-risk axis 2. */
  auditWindowMonths: z.number().int().default(24),

  currentAnnualValueCents: Cents,

  rateCard: z.array(RateCardLineSchema).default([]),
  tiers: z.array(TieredRateSchema).default([]),
  escalator: RevenueEscalatorSchema.nullable().default(null),
  commitment: CommitmentTermSchema.nullable().default(null),
  payment: PaymentTermSchema,

  /* seller-side commercial terms */
  priceIncreaseSchedule: z.array(PriceStepSchema).default([]), // RL02
  introDiscount: IntroDiscountSchema.nullable().default(null), // RL03
  surcharges: z.array(SurchargeTermSchema).default([]), // RL07
  /** Contractual late-payment interest, monthly fraction (0.015 = 1.5%/mo). RL10. */
  latePaymentInterestPct: z.number().nullable().default(null),

  signatory: z
    .object({ name: z.string(), title: z.string(), date: ISODateStr })
    .nullable()
    .default(null),
});
export type CustomerContract = z.infer<typeof CustomerContractSchema>;

/* ------------------------------------------------------------------ */
/* Billing document (← Invoice) — what the seller actually billed       */
/* ------------------------------------------------------------------ */

export const BillingLineSchema = z.object({
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
      "surcharge",
      "service",
      "minimum",
      "interest",
      "discount",
      "credit",
      "tax",
      "other",
    ])
    .default("other"),
  /** Links a billed line to a delivered work order (RL08). */
  workOrderId: z.string().nullable().default(null),
  assetId: z.string().nullable().default(null),
  periodStart: ISODateStr.nullable().default(null),
  periodEnd: ISODateStr.nullable().default(null),
  serviceDate: ISODateStr.nullable().default(null),
});
export type BillingLine = z.infer<typeof BillingLineSchema>;

export const BillingDocSchema = z.object({
  id: z.string(),
  customerId: z.string(),
  customerName: z.string(),
  sourceDoc: z.string(),

  /** "Billing Document No." — distinguishes a billing_export from a cost invoice on parse. */
  billingNumber: z.string(),
  invoiceDate: ISODateStr,
  dueDate: ISODateStr.nullable().default(null),
  poNumber: z.string().nullable().default(null),
  billingPeriodStart: ISODateStr.nullable().default(null),
  billingPeriodEnd: ISODateStr.nullable().default(null),
  /** Customer (the payer). */
  billTo: z.string().nullable().default(null),
  /** Seller (Northwind). */
  remitTo: z.string().nullable().default(null),
  currency: z.string().default("USD"),

  lines: z.array(BillingLineSchema),
  subtotalCents: Cents,
  taxCents: Cents.default(0),
  totalCents: Cents,

  paymentTerms: PaymentTermSchema.nullable().default(null),
  /** When the customer actually paid (null = open). */
  paidDate: ISODateStr.nullable().default(null),
});
export type BillingDoc = z.infer<typeof BillingDocSchema>;

/* ------------------------------------------------------------------ */
/* Work orders (← UsageRecord) — services delivered (RL08)              */
/* ------------------------------------------------------------------ */

export const WorkOrderSchema = z.object({
  customerId: z.string(),
  workOrderId: z.string(),
  serviceDate: ISODateStr,
  description: z.string(),
  sku: z.string().nullable().default(null),
  uom: z.string().default("each"),
  qty: z.number(),
  contractedUnitPriceCents: Cents,
  /** delivered = done; invoiced = billed; cancelled = not billable. */
  status: z.enum(["delivered", "invoiced", "cancelled"]).default("delivered"),
});
export type WorkOrder = z.infer<typeof WorkOrderSchema>;

/* ------------------------------------------------------------------ */
/* AR aging (the collections data source)                              */
/* ------------------------------------------------------------------ */

export const ARBucket = z.enum(["current", "1_30", "31_60", "61_90", "90_plus"]);
export type ARBucketT = z.infer<typeof ARBucket>;

export const ARAgingRecordSchema = z.object({
  customerId: z.string(),
  invoiceNumber: z.string(),
  invoiceDate: ISODateStr,
  dueDate: ISODateStr,
  balanceCents: Cents,
  /** Days past due as of the analysis date. */
  ageDays: z.number().int(),
  bucket: ARBucket,
  disputed: z.boolean().default(false),
  promiseToPayDate: ISODateStr.nullable().default(null),
  /** A prior promise-to-pay that was missed (strong negative signal). */
  promiseBroken: z.boolean().default(false),
  /** A recent partial payment (weak positive signal). */
  partialPayment: z.boolean().default(false),
  /** Count of prior write-offs against this customer. */
  priorWriteOffs: z.number().int().default(0),
});
export type ARAgingRecord = z.infer<typeof ARAgingRecordSchema>;

/* ------------------------------------------------------------------ */
/* Canonical dataset                                                   */
/* ------------------------------------------------------------------ */

export const CustomerRecordSchema = z.object({
  customer: CustomerSchema,
  contract: CustomerContractSchema.nullable().default(null),
  billings: z.array(BillingDocSchema).default([]),
  workOrders: z.array(WorkOrderSchema).default([]),
  arAging: z.array(ARAgingRecordSchema).default([]),
});
export type CustomerRecord = z.infer<typeof CustomerRecordSchema>;

export const RevenueDatasetSchema = z.object({
  seller: z.string(),
  analysisDate: ISODateStr,
  customers: z.array(CustomerRecordSchema),
});
export type RevenueDataset = z.infer<typeof RevenueDatasetSchema>;

/* ------------------------------------------------------------------ */
/* Findings                                                            */
/* ------------------------------------------------------------------ */

export const RecoveryType = z.enum(["arrears", "uplift"]);
export type RecoveryTypeT = z.infer<typeof RecoveryType>;

export const RelationshipRiskGrade = z.enum(["A", "B", "C"]);
export type RelationshipRiskGradeT = z.infer<typeof RelationshipRiskGrade>;

export const RecommendedAction = z.enum([
  "retroactive_claim", // A — back-bill + invoke audit/true-up clause
  "negotiate_partial", // B — forward correction + negotiate partial arrears
  "forward_only", // C — silent forward correction, no arrears
]);
export type RecommendedActionT = z.infer<typeof RecommendedAction>;

export const RevenueFindingCategory = z.enum([
  "escalator_missed",
  "price_step_missed",
  "expired_discount",
  "tier_breach",
  "unbilled_usage",
  "min_commit_shortfall",
  "missing_surcharge",
  "unbilled_services",
  "renewal_repricing",
  "late_interest",
  "rebate_over_credit",
  "other",
]);
export type RevenueFindingCategoryT = z.infer<typeof RevenueFindingCategory>;

/** Transparency on the 4-axis relationship-risk score (each 0..1). See ./rules/risk. */
export const RiskFactorsSchema = z.object({
  /** Strength of contractual entitlement to the money. */
  entitlement: z.number(),
  /** How much of the arrears falls within the audit window / statute. */
  auditWindow: z.number(),
  /** Inverse waiver/estoppel risk (1 = clean, 0 = knowingly under-billed for years). */
  waiverEstoppel: z.number(),
  /** Inverse relationship/churn risk (1 = low-stakes account, 0 = strategic). */
  relationship: z.number(),
});
export type RiskFactors = z.infer<typeof RiskFactorsSchema>;

export const RevenueFindingSchema = z.object({
  id: z.string(),
  ruleId: z.string(),
  ruleName: z.string(),
  category: RevenueFindingCategory,
  customerId: z.string(),
  customerName: z.string(),

  title: z.string(),
  summary: z.string(),

  /** Which component dominates (drives copy + the realization tracker lane). */
  recoveryType: RecoveryType,
  /** Back-billable arrears to date (recovery — billed at 30%). */
  arrearsToDateCents: Cents.default(0),
  /** Forward annualised run-rate uplift (avoidance — billed at 20%). */
  annualizedUpliftCents: Cents.default(0),
  /** arrears + uplift — the primary ranking key. */
  totalRecoverableCents: Cents,

  /** Blended effective fee rate across arrears (30%) and uplift (20%). */
  feeRate: z.number(),
  estimatedFeeCents: Cents,

  relationshipRisk: RelationshipRiskGrade,
  recommendedAction: RecommendedAction,
  riskFactors: RiskFactorsSchema,

  confidence: z.number(),
  severity: z
    .enum(["critical", "urgent", "high", "medium", "watch"])
    .default("medium"),

  leverage: z.string(),
  evidence: z.array(EvidenceSchema).default([]),
  recommendedAsk: z.string().nullable().default(null),
  /** The contract clause to cite in the corrected invoice / price-increase notice. */
  clauseCited: z.string().nullable().default(null),
  deadlineDate: ISODateStr.nullable().default(null),
});
export type RevenueFinding = z.infer<typeof RevenueFindingSchema>;

/* ------------------------------------------------------------------ */
/* Collections (AR prioritization — not a finding)                     */
/* ------------------------------------------------------------------ */

export const CollectionFactorsSchema = z.object({
  ageDays: z.number().int(),
  disputed: z.boolean(),
  promiseBroken: z.boolean(),
  promiseKept: z.boolean(),
  partialPayment: z.boolean(),
  priorWriteOffs: z.number().int(),
});
export type CollectionFactors = z.infer<typeof CollectionFactorsSchema>;

export const CollectionScoreSchema = z.object({
  customerId: z.string(),
  customerName: z.string(),
  invoiceNumber: z.string(),
  balanceCents: Cents,
  ageDays: z.number().int(),
  bucket: ARBucket,
  /** Probability of successful collection, 0..1. */
  pCollect: z.number(),
  /** Expected Recoverable Value = balance × pCollect — the ranking key. */
  ervCents: Cents,
  factors: CollectionFactorsSchema,
  recommendedAction: z.string(),
});
export type CollectionScore = z.infer<typeof CollectionScoreSchema>;

/* ------------------------------------------------------------------ */
/* Analysis result (what /api/revenue/sample returns to the UI)        */
/* ------------------------------------------------------------------ */

export const RevenueAnalysisSummarySchema = z.object({
  seller: z.string(),
  analysisDate: ISODateStr,
  documentsProcessed: z.number().int(),
  documentsFailed: z.number().int(),
  customersAnalyzed: z.number().int(),
  customersWithFindings: z.number().int().default(0),
  totalContractRevenueCents: Cents,
  totalArrearsCents: Cents,
  totalAnnualizedUpliftCents: Cents,
  totalRecoverableCents: Cents,
  estimatedFeeCents: Cents,
  findingCount: z.number().int(),
  totalOpenARCents: Cents,
  /** Sum of ERV across the collections queue. */
  totalExpectedRecoverableCents: Cents,
  /** Days Sales Outstanding. */
  dso: z.number(),
});
export type RevenueAnalysisSummary = z.infer<typeof RevenueAnalysisSummarySchema>;

export const RevenueCategorySummarySchema = z.object({
  category: RevenueFindingCategory,
  label: z.string(),
  count: z.number().int(),
  recoverableCents: Cents,
  arrearsCents: Cents.default(0),
  upliftCents: Cents.default(0),
});
export type RevenueCategorySummary = z.infer<
  typeof RevenueCategorySummarySchema
>;

export const CustomerSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  segment: z.string(),
  annualRevenueCents: Cents,
  recoverableCents: Cents,
  arrearsCents: Cents.default(0),
  upliftCents: Cents.default(0),
  findingCount: z.number().int(),
  openARCents: Cents.default(0),
});
export type CustomerSummary = z.infer<typeof CustomerSummarySchema>;

export const RevenueDocumentSummarySchema = z.object({
  customerId: z.string(),
  customerName: z.string(),
  docType: z.enum(["customer_contract", "billing_export", "ar_aging"]),
  format: z.enum(["pdf", "excel", "word"]),
  fileName: z.string(),
  path: z.string().nullable().default(null),
  sizeBytes: z.number().int().nullable().default(null),
  clauses: z
    .array(z.object({ heading: z.string(), body: z.string() }))
    .default([]),
});
export type RevenueDocumentSummary = z.infer<
  typeof RevenueDocumentSummarySchema
>;

/** An upcoming corrective price action with its mechanism (powers the uplift calendar). */
export const PriceIncreaseSchema = z.object({
  customerId: z.string(),
  customerName: z.string(),
  segment: z.string(),
  mechanism: z.enum(["escalator", "step", "discount_expiry", "renewal"]),
  effectiveDate: ISODateStr,
  currentPriceCents: Cents,
  correctPriceCents: Cents,
  upliftCents: Cents,
  daysToEffective: z.number().int(),
  clause: z.string().nullable().default(null),
});
export type PriceIncrease = z.infer<typeof PriceIncreaseSchema>;

export const ARBucketSummarySchema = z.object({
  bucket: ARBucket,
  label: z.string(),
  count: z.number().int(),
  balanceCents: Cents,
});
export type ARBucketSummary = z.infer<typeof ARBucketSummarySchema>;

export const ARAgingSummarySchema = z.object({
  buckets: z.array(ARBucketSummarySchema),
  totalOpenCents: Cents,
  dso: z.number(),
});
export type ARAgingSummary = z.infer<typeof ARAgingSummarySchema>;

export const RevenueAnalysisResultSchema = z.object({
  summary: RevenueAnalysisSummarySchema,
  findings: z.array(RevenueFindingSchema),
  drafts: z.array(EmailDraftSchema).default([]),
  categories: z.array(RevenueCategorySummarySchema).default([]),
  customers: z.array(CustomerSummarySchema).default([]),
  documents: z.array(RevenueDocumentSummarySchema).default([]),
  priceIncreases: z.array(PriceIncreaseSchema).default([]),
  collections: z.array(CollectionScoreSchema).default([]),
  arAging: ARAgingSummarySchema,
});
export type RevenueAnalysisResult = z.infer<typeof RevenueAnalysisResultSchema>;

/** Re-export the shared BillingPeriod enum for convenience in seed authoring. */
export { BillingPeriodSchema };

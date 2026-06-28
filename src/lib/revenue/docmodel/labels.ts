/**
 * The layout contract for the REVENUE-LEAKAGE (seller-side) documents. Mirrors
 * ../../docmodel/labels (the cost side): these exact label/column strings are
 * what the documents display and what the parser keys off. Both to-docmodel and
 * from-docmodel reference these constants so they can never silently drift.
 *
 * Shared fields REUSE the identical string values from F/T (rate card, tiers,
 * payment terms, dates, signatory, etc.). Each revenue doc type carries a UNIQUE
 * distinguishing field the PDF parser keys on (see parsing/pdf.ts detectDocType):
 *   customer_contract → "Seller"
 *   billing_export    → "Billing Document No."
 *   ar_aging          → "AR Statement Date"
 */
import { F as COST_F, T as COST_T } from "../../docmodel/labels";

export const RF = {
  // shared / identity
  contractId: COST_F.contractId, // "Contract ID"
  /** UNIQUE marker for customer_contract. */
  seller: "Seller",
  customer: COST_F.customer, // "Customer"
  customerAliases: "Customer Aliases",
  segment: "Segment",
  currency: COST_F.currency, // "Currency"

  // term / renewal
  effectiveDate: COST_F.effectiveDate, // "Effective Date"
  endDate: COST_F.endDate, // "End Date"
  initialTerm: COST_F.initialTerm, // "Initial Term (Months)"
  autoRenew: COST_F.autoRenew, // "Auto-Renew"
  noticeWindow: COST_F.noticeWindow, // "Notice Window (Days)"
  noticeMethod: COST_F.noticeMethod, // "Notice Method"
  renewalTerm: COST_F.renewalTerm, // "Renewal Term (Months)"
  governingLaw: COST_F.governingLaw, // "Governing Law"
  auditWindow: "Audit Window (Months)",
  annualValue: COST_F.annualValue, // "Annual Contract Value"
  paymentTerms: COST_F.paymentTerms, // "Payment Terms"

  // escalator (richer than cost side)
  escalatorType: COST_F.escalatorType, // "Escalator Type"
  escalatorFixed: COST_F.escalatorFixed, // "Escalator Rate"
  escalatorIndexPlus: "Escalator Index Plus",
  escalatorCap: COST_F.escalatorCap, // "Escalator Cap"
  escalatorFloor: "Escalator Floor",
  escalatorMonth: COST_F.escalatorMonth, // "Escalation Anniversary Month"
  escalatorBaseYear: "Escalation Base Index Year",
  escalatorCompounding: "Escalator Compounding",

  // intro discount (RL03)
  introDiscountPct: "Introductory Discount",
  introDiscountExpiry: "Introductory Discount Expiry",
  introDiscountSku: "Introductory Discount SKU",

  // late-payment interest (RL10)
  latePaymentInterest: "Late Payment Interest",

  // commitment / plan
  minCommitSpend: COST_F.minCommitSpend, // "Minimum Commitment (Spend)"
  minCommitQty: COST_F.minCommitQty, // "Minimum Commitment (Qty)"
  measurementPeriod: COST_F.measurementPeriod, // "Measurement Period"
  includedAllowance: COST_F.includedAllowance, // "Included Allowance"
  overagePrice: COST_F.overagePrice, // "Overage Unit Price"
  contractedSeats: COST_F.contractedSeats, // "Contracted Seats"
  planTier: COST_F.planTier, // "Plan Tier"
  tierPricePerSeat: COST_F.tierPricePerSeat, // "Tier Price Per Seat"

  // signatory
  signedBy: COST_F.signedBy, // "Signed By"
  signedTitle: COST_F.signedTitle, // "Signatory Title"
  signedDate: COST_F.signedDate, // "Signature Date"

  // billing export
  /** UNIQUE marker for billing_export. */
  billingNumber: "Billing Document No.",
  invoiceDate: COST_F.invoiceDate, // "Invoice Date"
  dueDate: COST_F.dueDate, // "Due Date"
  poNumber: COST_F.poNumber, // "PO Number"
  billingStart: COST_F.billingStart, // "Billing Period Start"
  billingEnd: COST_F.billingEnd, // "Billing Period End"
  billTo: COST_F.billTo, // "Bill To"
  remitTo: COST_F.remitTo, // "Remit To"
  subtotal: COST_F.subtotal, // "Subtotal"
  tax: COST_F.tax, // "Tax"
  total: COST_F.total, // "Total"
  paidDate: "Paid Date",

  // ar aging / statement of account
  /** UNIQUE marker for ar_aging. */
  arStatementDate: "AR Statement Date",
} as const;

export const RT = {
  rateCard: {
    name: COST_T.rateCard.name, // "Rate Card"
    columns: [...COST_T.rateCard.columns],
  },
  tiers: {
    name: COST_T.tiers.name, // "Volume Tiers"
    columns: [...COST_T.tiers.columns],
  },
  priceSchedule: {
    name: "Price Increase Schedule",
    columns: ["Effective Date", "New Unit Price", "SKU", "Note"],
  },
  surcharges: {
    name: "Surcharges",
    columns: ["Kind", "Label", "Basis", "Rate %", "Per Unit"],
  },
  lineItems: {
    name: COST_T.lineItems.name, // "Line Items"
    columns: [
      "Description",
      "SKU",
      "UoM",
      "Qty",
      "Unit Price",
      "Amount",
      "Type",
      "Work Order",
      "Asset ID",
      "Service Date",
    ],
  },
  arAging: {
    name: "AR Aging",
    columns: [
      "Invoice",
      "Invoice Date",
      "Due Date",
      "Balance",
      "Age Days",
      "Bucket",
      "Disputed",
      "Promise To Pay",
      "Promise Broken",
      "Partial",
      "Prior Write-Offs",
    ],
  },
  workOrders: {
    name: "Work Order Register",
    columns: [
      "Work Order",
      "Service Date",
      "Description",
      "SKU",
      "UoM",
      "Qty",
      "Unit Price",
      "Status",
    ],
  },
} as const;

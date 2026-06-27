/**
 * The layout contract. These exact label/column strings are what the documents
 * display and what the parser keys off. Both to-docmodel and from-docmodel
 * reference these constants so they can never silently drift.
 */

export const F = {
  // shared
  contractId: "Contract ID",
  vendor: "Vendor",
  customer: "Customer",
  category: "Category",
  currency: "Currency",

  // term / renewal
  effectiveDate: "Effective Date",
  endDate: "End Date",
  initialTerm: "Initial Term (Months)",
  autoRenew: "Auto-Renew",
  noticeWindow: "Notice Window (Days)",
  noticeMethod: "Notice Method",
  renewalTerm: "Renewal Term (Months)",
  earlyTermFee: "Early Termination Fee",
  governingLaw: "Governing Law",
  annualValue: "Annual Contract Value",
  paymentTerms: "Payment Terms",

  // escalator
  escalatorType: "Escalator Type",
  escalatorFixed: "Escalator Rate",
  escalatorCpiPlus: "Escalator CPI Plus",
  escalatorCap: "Escalator Cap",
  escalatorMonth: "Escalation Anniversary Month",

  // commitment / plan
  minCommitSpend: "Minimum Commitment (Spend)",
  minCommitQty: "Minimum Commitment (Qty)",
  measurementPeriod: "Measurement Period",
  includedAllowance: "Included Allowance",
  overagePrice: "Overage Unit Price",
  contractedSeats: "Contracted Seats",
  planTier: "Plan Tier",
  tierPricePerSeat: "Tier Price Per Seat",

  // category extras
  capabilityTags: "Capability Tags",
  scheduledHours: "Scheduled Hours Per Week",
  holidayCalendar: "Holiday Calendar",
  feePctOfBase: "Fee % of Base",
  pepmRate: "PEPM Rate",

  // signatory
  signedBy: "Signed By",
  signedTitle: "Signatory Title",
  signedDate: "Signature Date",

  // invoice
  invoiceNumber: "Invoice Number",
  invoiceDate: "Invoice Date",
  dueDate: "Due Date",
  poNumber: "PO Number",
  billingStart: "Billing Period Start",
  billingEnd: "Billing Period End",
  billTo: "Bill To",
  remitTo: "Remit To",
  ein: "EIN",
  subtotal: "Subtotal",
  tax: "Tax",
  total: "Total",
  actualPayDate: "Actual Pay Date",

  // usage export
  exportType: "Export Type",
  asOfDate: "As Of Date",
} as const;

export const T = {
  rateCard: {
    name: "Rate Card",
    columns: [
      "SKU",
      "Description",
      "UoM",
      "Unit Price",
      "Tier Min",
      "Tier Max",
      "Base Fee",
      "Effective From",
      "Effective To",
    ],
  },
  tiers: {
    name: "Volume Tiers",
    columns: ["Tier Min", "Tier Max", "Base Fee", "Unit Price", "Overage Rate"],
  },
  seasons: {
    name: "Season Windows",
    columns: ["Service", "Start Month", "End Month"],
  },
  features: {
    name: "Feature Catalog",
    columns: ["Feature", "Min Tier"],
  },
  lineItems: {
    name: "Line Items",
    columns: [
      "Description",
      "SKU",
      "UoM",
      "Qty",
      "Unit Price",
      "Amount",
      "Type",
      "Asset ID",
      "Service Date",
      "Labor Type",
    ],
  },
  usage: {
    name: "Usage Records",
    columns: [
      "Kind",
      "Identifier",
      "Status",
      "Last Active",
      "Provisioned",
      "Feature",
      "Used",
      "Tier",
      "Period",
      "Count",
      "Decommission Date",
    ],
  },
} as const;

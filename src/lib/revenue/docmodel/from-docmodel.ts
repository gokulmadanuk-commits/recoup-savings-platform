/**
 * DocModel -> canonical REVENUE record. Mirror of ../../docmodel/from-docmodel,
 * seller-side. A parsed document (fields + tables) is mapped back into the
 * validated canonical model the revenue rules consume. Exact inverse of
 * ./to-docmodel so canonical -> DocModel -> canonical is an identity.
 */
import type { DocModel } from "../../types";
import {
  CustomerContractSchema,
  BillingDocSchema,
  ARAgingRecordSchema,
  WorkOrderSchema,
  RevenueDatasetSchema,
  type CustomerContract,
  type BillingDoc,
  type ARAgingRecord,
  type WorkOrder,
  type RevenueDataset,
} from "../types";
import { RF, RT } from "./labels";
import { parsePaymentTerms } from "../../docmodel/from-docmodel";
import * as S from "../../docmodel/serialize";

function fieldMap(doc: DocModel): Map<string, string> {
  const m = new Map<string, string>();
  for (const f of doc.fields) if (!m.has(f.label)) m.set(f.label, f.value);
  return m;
}

function table(doc: DocModel, name: string) {
  return doc.tables.find((t) => t.name === name);
}

/** Map a table's rows into column-keyed records. */
function rows(doc: DocModel, name: string): Record<string, string>[] {
  const t = table(doc, name);
  if (!t) return [];
  return t.rows.map((row) => {
    const rec: Record<string, string> = {};
    t.columns.forEach((col, i) => (rec[col] = row[i] ?? ""));
    return rec;
  });
}

const orNull = (v: string | undefined): string | null => (v && v !== "" ? v : null);

export function docModelToCustomerContract(doc: DocModel): CustomerContract {
  const g = fieldMap(doc);
  const get = (l: string) => g.get(l);

  const escalator = g.has(RF.escalatorType)
    ? {
        type: g.get(RF.escalatorType)!,
        fixedPct: g.has(RF.escalatorFixed) ? S.parsePct(g.get(RF.escalatorFixed)!) : null,
        indexPlusPct: g.has(RF.escalatorIndexPlus)
          ? S.parsePct(g.get(RF.escalatorIndexPlus)!)
          : null,
        capPct: g.has(RF.escalatorCap) ? S.parsePct(g.get(RF.escalatorCap)!) : null,
        floorPct: g.has(RF.escalatorFloor) ? S.parsePct(g.get(RF.escalatorFloor)!) : null,
        anniversaryMonth: g.has(RF.escalatorMonth)
          ? S.parseNum(g.get(RF.escalatorMonth)!)
          : null,
        baseIndexYear: g.has(RF.escalatorBaseYear)
          ? S.parseNum(g.get(RF.escalatorBaseYear)!)
          : null,
        compounding: g.has(RF.escalatorCompounding)
          ? S.parseBool(g.get(RF.escalatorCompounding)!)
          : true,
      }
    : null;

  const introDiscount = g.has(RF.introDiscountPct)
    ? {
        pct: S.parsePct(g.get(RF.introDiscountPct)!),
        expiryDate: get(RF.introDiscountExpiry)!,
        appliesToSku: orNull(get(RF.introDiscountSku)),
      }
    : null;

  const hasCommit =
    g.has(RF.minCommitSpend) ||
    g.has(RF.minCommitQty) ||
    g.has(RF.measurementPeriod) ||
    g.has(RF.includedAllowance) ||
    g.has(RF.overagePrice) ||
    g.has(RF.contractedSeats) ||
    g.has(RF.planTier) ||
    g.has(RF.tierPricePerSeat);
  const commitment = hasCommit
    ? {
        minCommitSpendCents: g.has(RF.minCommitSpend)
          ? S.parseMoney(g.get(RF.minCommitSpend)!)
          : null,
        minCommitQty: g.has(RF.minCommitQty) ? S.parseNum(g.get(RF.minCommitQty)!) : null,
        measurementPeriod: get(RF.measurementPeriod) ?? "annual",
        includedAllowance: g.has(RF.includedAllowance)
          ? S.parseNum(g.get(RF.includedAllowance)!)
          : null,
        overageUnitPriceCents: g.has(RF.overagePrice)
          ? S.parseMoney(g.get(RF.overagePrice)!)
          : null,
        contractedSeats: g.has(RF.contractedSeats)
          ? S.parseNum(g.get(RF.contractedSeats)!)
          : null,
        tier: orNull(get(RF.planTier)),
        tierPricePerSeatCents: g.has(RF.tierPricePerSeat)
          ? S.parseMoney(g.get(RF.tierPricePerSeat)!)
          : null,
      }
    : null;

  const signedBy = get(RF.signedBy);
  const signatory = signedBy
    ? { name: signedBy, title: get(RF.signedTitle) ?? "", date: get(RF.signedDate) ?? "" }
    : null;

  const customerName = get(RF.customer) ?? doc.vendorName;

  return CustomerContractSchema.parse({
    id: get(RF.contractId) ?? `MSA-${S.slug(customerName).toUpperCase()}`,
    customerId: S.slug(customerName),
    customerName,
    segment: get(RF.segment) ?? "",
    sourceDoc: doc.fileName,
    seller: get(RF.seller)!,
    effectiveDate: get(RF.effectiveDate)!,
    endDate: get(RF.endDate)!,
    initialTermMonths: S.parseNum(get(RF.initialTerm) ?? "0"),
    autoRenew: S.parseBool(get(RF.autoRenew) ?? "No"),
    noticeWindowDays: S.parseNum(get(RF.noticeWindow) ?? "0"),
    noticeMethod: orNull(get(RF.noticeMethod)),
    renewalTermMonths: S.parseNum(get(RF.renewalTerm) ?? "12"),
    governingLaw: orNull(get(RF.governingLaw)),
    auditWindowMonths: S.parseNum(get(RF.auditWindow) ?? "24"),
    currentAnnualValueCents: S.parseMoney(get(RF.annualValue) ?? "$0"),
    payment: parsePaymentTerms(get(RF.paymentTerms) ?? "Net 30"),
    escalator,
    commitment,
    introDiscount,
    latePaymentInterestPct: g.has(RF.latePaymentInterest)
      ? S.parsePct(g.get(RF.latePaymentInterest)!)
      : null,
    rateCard: rows(doc, RT.rateCard.name).map((r) => ({
      sku: r["SKU"],
      description: r["Description"],
      uom: r["UoM"],
      unitPriceCents: S.parseMoney(r["Unit Price"]),
      currency: "USD",
      effectiveFrom: orNull(r["Effective From"]),
      effectiveTo: orNull(r["Effective To"]),
      tierMin: r["Tier Min"] ? S.parseNum(r["Tier Min"]) : null,
      tierMax: r["Tier Max"] ? S.parseNum(r["Tier Max"]) : null,
      tierBaseFeeCents: r["Base Fee"] ? S.parseMoney(r["Base Fee"]) : null,
    })),
    tiers: rows(doc, RT.tiers.name).map((r) => ({
      tierMin: S.parseNum(r["Tier Min"]),
      tierMax: r["Tier Max"] ? S.parseNum(r["Tier Max"]) : null,
      baseFeeCents: r["Base Fee"] ? S.parseMoney(r["Base Fee"]) : 0,
      unitPriceCents: S.parseMoney(r["Unit Price"]),
      overageRateCents: r["Overage Rate"] ? S.parseMoney(r["Overage Rate"]) : null,
    })),
    priceIncreaseSchedule: rows(doc, RT.priceSchedule.name).map((r) => ({
      effectiveDate: r["Effective Date"],
      newUnitPriceCents: S.parseMoney(r["New Unit Price"]),
      sku: orNull(r["SKU"]),
      note: orNull(r["Note"]),
    })),
    surcharges: rows(doc, RT.surcharges.name).map((r) => ({
      kind: r["Kind"] as "fuel" | "fx" | "index" | "other",
      label: r["Label"],
      basis: r["Basis"],
      ratePct: r["Rate %"] ? S.parsePct(r["Rate %"]) : null,
      perUnitCents: r["Per Unit"] ? S.parseMoney(r["Per Unit"]) : null,
    })),
    signatory,
  });
}

export function docModelToBilling(doc: DocModel): BillingDoc {
  const g = fieldMap(doc);
  const get = (l: string) => g.get(l);
  const customerName = get(RF.customer) ?? doc.vendorName;
  const billingNumber = get(RF.billingNumber)!;

  return BillingDocSchema.parse({
    id: billingNumber,
    customerId: S.slug(customerName),
    customerName,
    sourceDoc: doc.fileName,
    billingNumber,
    invoiceDate: get(RF.invoiceDate)!,
    dueDate: orNull(get(RF.dueDate)),
    poNumber: orNull(get(RF.poNumber)),
    billingPeriodStart: orNull(get(RF.billingStart)),
    billingPeriodEnd: orNull(get(RF.billingEnd)),
    billTo: orNull(get(RF.billTo)),
    remitTo: orNull(get(RF.remitTo)),
    currency: get(RF.currency) ?? "USD",
    paymentTerms: g.has(RF.paymentTerms) ? parsePaymentTerms(g.get(RF.paymentTerms)!) : null,
    paidDate: orNull(get(RF.paidDate)),
    subtotalCents: S.parseMoney(get(RF.subtotal) ?? "$0"),
    taxCents: g.has(RF.tax) ? S.parseMoney(g.get(RF.tax)!) : 0,
    totalCents: S.parseMoney(get(RF.total) ?? "$0"),
    lines: rows(doc, RT.lineItems.name).map((r) => ({
      description: r["Description"],
      sku: orNull(r["SKU"]),
      uom: r["UoM"] || "each",
      qty: S.parseNum(r["Qty"]),
      unitPriceCents: S.parseMoney(r["Unit Price"]),
      lineTotalCents: S.parseMoney(r["Amount"]),
      lineType: (r["Type"] || "other") as BillingDoc["lines"][number]["lineType"],
      workOrderId: orNull(r["Work Order"]),
      assetId: orNull(r["Asset ID"]),
      serviceDate: orNull(r["Service Date"]),
      periodStart: null,
      periodEnd: null,
    })),
  });
}

export function docModelToStatement(doc: DocModel): {
  arAging: ARAgingRecord[];
  workOrders: WorkOrder[];
} {
  const customerName = fieldMap(doc).get(RF.customer) ?? doc.vendorName;
  const customerId = S.slug(customerName);

  const arAging = rows(doc, RT.arAging.name).map((r) =>
    ARAgingRecordSchema.parse({
      customerId,
      invoiceNumber: r["Invoice"],
      invoiceDate: r["Invoice Date"],
      dueDate: r["Due Date"],
      balanceCents: S.parseMoney(r["Balance"]),
      ageDays: S.parseNum(r["Age Days"]),
      bucket: r["Bucket"] as ARAgingRecord["bucket"],
      disputed: r["Disputed"] ? S.parseBool(r["Disputed"]) : false,
      promiseToPayDate: orNull(r["Promise To Pay"]),
      promiseBroken: r["Promise Broken"] ? S.parseBool(r["Promise Broken"]) : false,
      partialPayment: r["Partial"] ? S.parseBool(r["Partial"]) : false,
      priorWriteOffs: r["Prior Write-Offs"] ? S.parseNum(r["Prior Write-Offs"]) : 0,
    }),
  );

  const workOrders = rows(doc, RT.workOrders.name).map((r) =>
    WorkOrderSchema.parse({
      customerId,
      workOrderId: r["Work Order"],
      serviceDate: r["Service Date"],
      description: r["Description"],
      sku: orNull(r["SKU"]),
      uom: r["UoM"] || "each",
      qty: S.parseNum(r["Qty"]),
      contractedUnitPriceCents: S.parseMoney(r["Unit Price"]),
      status: (r["Status"] || "delivered") as WorkOrder["status"],
    }),
  );

  return { arAging, workOrders };
}

export interface AssemblyFailure {
  fileName: string;
  reason: string;
}

function reason(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/**
 * Group parsed documents by customer into the canonical RevenueDataset the rules
 * read. Resilient by design: a document that can't be mapped is skipped and
 * reported via `failures` — it never aborts the batch. Documents with no
 * identifiable customer are skipped rather than collapsed into a bogus record.
 */
/**
 * The customer name for grouping. PDFs don't preserve the DocModel.vendorName
 * marker (the cost parser derives it from a "Vendor" field, which revenue docs
 * lack), so read the "Customer" field first and only fall back to the marker.
 */
function customerNameOf(doc: DocModel): string {
  const field = doc.fields.find((f) => f.label === RF.customer)?.value?.trim();
  if (field) return field;
  const marker = doc.vendorName?.trim();
  return marker && marker.toLowerCase() !== "unknown" ? marker : "";
}

export function assembleRevenueDataset(
  docs: DocModel[],
  seller: string,
  analysisDate: string,
  failures: AssemblyFailure[] = [],
): RevenueDataset {
  const byCustomer = new Map<string, DocModel[]>();
  for (const d of docs) {
    const name = customerNameOf(d);
    if (!name || name.toLowerCase() === "unknown") {
      failures.push({
        fileName: d.fileName,
        reason: "No identifiable customer on the document; skipped.",
      });
      continue;
    }
    if (!byCustomer.has(name)) byCustomer.set(name, []);
    byCustomer.get(name)!.push(d);
  }

  const customers: RevenueDataset["customers"] = [];
  for (const [customerName, cdocs] of byCustomer) {
    const contractDoc = cdocs.find((d) => d.docType === "customer_contract");
    let contract: CustomerContract | null = null;
    if (contractDoc) {
      try {
        contract = docModelToCustomerContract(contractDoc);
      } catch (e) {
        failures.push({
          fileName: contractDoc.fileName,
          reason: `Contract could not be read: ${reason(e)}`,
        });
      }
    }
    const aliasField = contractDoc?.fields.find((f) => f.label === RF.customerAliases);
    const aliases = aliasField ? S.parseList(aliasField.value) : [];

    const billings: BillingDoc[] = [];
    for (const d of cdocs.filter((d) => d.docType === "billing_export")) {
      try {
        billings.push(docModelToBilling(d));
      } catch (e) {
        failures.push({
          fileName: d.fileName,
          reason: `Billing document could not be read: ${reason(e)}`,
        });
      }
    }

    let arAging: ARAgingRecord[] = [];
    let workOrders: WorkOrder[] = [];
    for (const d of cdocs.filter((d) => d.docType === "ar_aging")) {
      try {
        const parsed = docModelToStatement(d);
        arAging = arAging.concat(parsed.arAging);
        workOrders = workOrders.concat(parsed.workOrders);
      } catch (e) {
        failures.push({
          fileName: d.fileName,
          reason: `Statement of account could not be read: ${reason(e)}`,
        });
      }
    }

    // Nothing usable for this customer — don't emit an empty record.
    if (!contract && billings.length === 0 && arAging.length === 0 && workOrders.length === 0) {
      continue;
    }

    const segment = contract?.segment ?? "";
    customers.push({
      customer: { id: S.slug(customerName), name: customerName, segment, aliases },
      contract,
      billings,
      workOrders,
      arAging,
    });
  }

  return RevenueDatasetSchema.parse({ seller, analysisDate, customers });
}

/**
 * DocModel -> canonical. Drives parsing: a parsed document (fields + tables) is
 * mapped back into the validated canonical model the rules consume. Exact
 * inverse of to-docmodel.
 */
import {
  ContractSchema,
  InvoiceSchema,
  UsageRecordSchema,
  DatasetSchema,
  type Contract,
  type Invoice,
  type UsageRecord,
  type Dataset,
  type DocModel,
  type PaymentTerm,
} from "../types";
import { F, T } from "./labels";
import * as S from "./serialize";

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

export function parsePaymentTerms(s: string): PaymentTerm {
  const m = s.match(/^(?:([\d.]+)\/(\d+)\s+)?net\s+(\d+)$/i);
  if (!m) return { netDays: 30, discountPct: 0, discountDays: 0 };
  return {
    discountPct: m[1] ? Number(m[1]) / 100 : 0,
    discountDays: m[2] ? Number(m[2]) : 0,
    netDays: Number(m[3]),
  };
}

export function docModelToContract(doc: DocModel): Contract {
  const g = fieldMap(doc);
  const get = (l: string) => g.get(l);

  const escalatorType = get(F.escalatorType);
  const escalator = escalatorType
    ? {
        type: escalatorType,
        fixedPct: g.has(F.escalatorFixed) ? S.parsePct(g.get(F.escalatorFixed)!) : null,
        cpiPlusPct: g.has(F.escalatorCpiPlus) ? S.parsePct(g.get(F.escalatorCpiPlus)!) : null,
        capPct: g.has(F.escalatorCap) ? S.parsePct(g.get(F.escalatorCap)!) : null,
        anniversaryMonth: g.has(F.escalatorMonth) ? S.parseNum(g.get(F.escalatorMonth)!) : null,
      }
    : null;

  const hasCommit =
    g.has(F.minCommitSpend) ||
    g.has(F.minCommitQty) ||
    g.has(F.measurementPeriod) ||
    g.has(F.includedAllowance) ||
    g.has(F.overagePrice) ||
    g.has(F.contractedSeats) ||
    g.has(F.planTier) ||
    g.has(F.tierPricePerSeat);
  const commitment = hasCommit
    ? {
        minCommitSpendCents: g.has(F.minCommitSpend) ? S.parseMoney(g.get(F.minCommitSpend)!) : null,
        minCommitQty: g.has(F.minCommitQty) ? S.parseNum(g.get(F.minCommitQty)!) : null,
        measurementPeriod: get(F.measurementPeriod) ?? "annual",
        includedAllowance: g.has(F.includedAllowance) ? S.parseNum(g.get(F.includedAllowance)!) : null,
        overageUnitPriceCents: g.has(F.overagePrice) ? S.parseMoney(g.get(F.overagePrice)!) : null,
        contractedSeats: g.has(F.contractedSeats) ? S.parseNum(g.get(F.contractedSeats)!) : null,
        tier: orNull(get(F.planTier)),
        tierPricePerSeatCents: g.has(F.tierPricePerSeat)
          ? S.parseMoney(g.get(F.tierPricePerSeat)!)
          : null,
      }
    : null;

  const signedBy = get(F.signedBy);
  const signatory = signedBy
    ? { name: signedBy, title: get(F.signedTitle) ?? "", date: get(F.signedDate) ?? "" }
    : null;

  const vendorName = get(F.vendor) ?? doc.vendorName;

  return ContractSchema.parse({
    id: get(F.contractId) ?? `${S.slug(vendorName)}-contract`,
    vendorId: S.slug(vendorName),
    vendorName,
    category: get(F.category) ?? "",
    sourceDoc: doc.fileName,
    customer: get(F.customer) ?? "",
    effectiveDate: get(F.effectiveDate)!,
    endDate: get(F.endDate)!,
    initialTermMonths: S.parseNum(get(F.initialTerm) ?? "0"),
    autoRenew: S.parseBool(get(F.autoRenew) ?? "No"),
    noticeWindowDays: S.parseNum(get(F.noticeWindow) ?? "0"),
    noticeMethod: orNull(get(F.noticeMethod)),
    renewalTermMonths: S.parseNum(get(F.renewalTerm) ?? "12"),
    earlyTermFeeCents: g.has(F.earlyTermFee) ? S.parseMoney(g.get(F.earlyTermFee)!) : 0,
    governingLaw: orNull(get(F.governingLaw)),
    currentAnnualValueCents: S.parseMoney(get(F.annualValue) ?? "$0"),
    payment: parsePaymentTerms(get(F.paymentTerms) ?? "Net 30"),
    escalator,
    commitment,
    rateCard: rows(doc, T.rateCard.name).map((r) => ({
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
    tiers: rows(doc, T.tiers.name).map((r) => ({
      tierMin: S.parseNum(r["Tier Min"]),
      tierMax: r["Tier Max"] ? S.parseNum(r["Tier Max"]) : null,
      baseFeeCents: r["Base Fee"] ? S.parseMoney(r["Base Fee"]) : 0,
      unitPriceCents: S.parseMoney(r["Unit Price"]),
      overageRateCents: r["Overage Rate"] ? S.parseMoney(r["Overage Rate"]) : null,
    })),
    seasonWindows: rows(doc, T.seasons.name).map((r) => ({
      service: r["Service"],
      startMonth: S.parseNum(r["Start Month"]),
      endMonth: S.parseNum(r["End Month"]),
    })),
    featureCatalog: rows(doc, T.features.name).map((r) => ({
      feature: r["Feature"],
      minTier: r["Min Tier"],
    })),
    capabilityTags: g.has(F.capabilityTags) ? S.parseList(g.get(F.capabilityTags)!) : [],
    scheduledHoursPerWeek: g.has(F.scheduledHours) ? S.parseNum(g.get(F.scheduledHours)!) : null,
    holidayCalendar: g.has(F.holidayCalendar) ? S.parseList(g.get(F.holidayCalendar)!) : [],
    feePctOfBase: g.has(F.feePctOfBase) ? S.parsePct(g.get(F.feePctOfBase)!) : null,
    pepmRateCents: g.has(F.pepmRate) ? S.parseMoney(g.get(F.pepmRate)!) : null,
    signatory,
  });
}

export function docModelToInvoice(doc: DocModel): Invoice {
  const g = fieldMap(doc);
  const get = (l: string) => g.get(l);
  const vendorName = get(F.vendor) ?? doc.vendorName;
  const invoiceNumber = get(F.invoiceNumber)!;

  return InvoiceSchema.parse({
    id: invoiceNumber,
    vendorId: S.slug(vendorName),
    vendorName,
    sourceDoc: doc.fileName,
    invoiceNumber,
    invoiceDate: get(F.invoiceDate)!,
    dueDate: orNull(get(F.dueDate)),
    poNumber: orNull(get(F.poNumber)),
    billingPeriodStart: orNull(get(F.billingStart)),
    billingPeriodEnd: orNull(get(F.billingEnd)),
    billTo: orNull(get(F.billTo)),
    remitTo: orNull(get(F.remitTo)),
    ein: orNull(get(F.ein)),
    currency: get(F.currency) ?? "USD",
    paymentTerms: g.has(F.paymentTerms) ? parsePaymentTerms(g.get(F.paymentTerms)!) : null,
    actualPayDate: orNull(get(F.actualPayDate)),
    subtotalCents: S.parseMoney(get(F.subtotal) ?? "$0"),
    taxCents: g.has(F.tax) ? S.parseMoney(g.get(F.tax)!) : 0,
    totalCents: S.parseMoney(get(F.total) ?? "$0"),
    lines: rows(doc, T.lineItems.name).map((r) => ({
      description: r["Description"],
      sku: orNull(r["SKU"]),
      uom: r["UoM"] || "each",
      qty: S.parseNum(r["Qty"]),
      unitPriceCents: S.parseMoney(r["Unit Price"]),
      lineTotalCents: S.parseMoney(r["Amount"]),
      lineType: (r["Type"] || "other") as Invoice["lines"][number]["lineType"],
      assetId: orNull(r["Asset ID"]),
      serviceDate: orNull(r["Service Date"]),
      laborType: (orNull(r["Labor Type"]) as "regular" | "ot" | "holiday" | null) ?? null,
      periodStart: null,
      periodEnd: null,
    })),
  });
}

export function docModelToUsage(doc: DocModel): UsageRecord[] {
  const vendorName = fieldMap(doc).get(F.vendor) ?? doc.vendorName;
  const vendorId = S.slug(vendorName);
  return rows(doc, T.usage.name).map((r) =>
    UsageRecordSchema.parse({
      vendorId,
      kind: r["Kind"] as UsageRecord["kind"],
      identifier: r["Identifier"],
      status: (orNull(r["Status"]) as UsageRecord["status"]) ?? null,
      lastActiveDate: orNull(r["Last Active"]),
      provisioned: r["Provisioned"] ? S.parseBool(r["Provisioned"]) : true,
      feature: orNull(r["Feature"]),
      used: r["Used"] ? S.parseBool(r["Used"]) : null,
      tier: orNull(r["Tier"]),
      period: orNull(r["Period"]),
      count: r["Count"] ? S.parseNum(r["Count"]) : null,
      decommissionDate: orNull(r["Decommission Date"]),
    }),
  );
}

export interface AssemblyFailure {
  fileName: string;
  reason: string;
}

function reason(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/**
 * Group parsed documents by vendor into the canonical Dataset the rules read.
 * Resilient by design: a document that can't be mapped (missing required fields,
 * etc.) is skipped and reported via `failures` — it never aborts the batch.
 * Documents with no identifiable vendor are skipped rather than collapsed into a
 * single bogus "Unknown" vendor that would be cross-referenced against itself.
 */
export function assembleDataset(
  docs: DocModel[],
  customer: string,
  analysisDate: string,
  failures: AssemblyFailure[] = [],
): Dataset {
  const byVendor = new Map<string, DocModel[]>();
  for (const d of docs) {
    const name = d.vendorName?.trim();
    if (!name || name.toLowerCase() === "unknown") {
      failures.push({ fileName: d.fileName, reason: "No identifiable vendor on the document; skipped." });
      continue;
    }
    if (!byVendor.has(name)) byVendor.set(name, []);
    byVendor.get(name)!.push(d);
  }

  const vendors: Dataset["vendors"] = [];
  for (const [vendorName, vdocs] of byVendor) {
    const contractDoc = vdocs.find((d) => d.docType === "contract");
    let contract = null;
    if (contractDoc) {
      try {
        contract = docModelToContract(contractDoc);
      } catch (e) {
        failures.push({ fileName: contractDoc.fileName, reason: `Contract could not be read: ${reason(e)}` });
      }
    }
    const aliasField = contractDoc?.fields.find((f) => f.label === F.vendorAliases);
    const aliases = aliasField ? S.parseList(aliasField.value) : [];

    const invoices = [];
    for (const d of vdocs.filter((d) => d.docType === "invoice")) {
      try {
        invoices.push(docModelToInvoice(d));
      } catch (e) {
        failures.push({ fileName: d.fileName, reason: `Invoice could not be read: ${reason(e)}` });
      }
    }

    const usage = [];
    for (const d of vdocs.filter((d) => d.docType === "usage_export")) {
      try {
        usage.push(...docModelToUsage(d));
      } catch (e) {
        failures.push({ fileName: d.fileName, reason: `Usage export could not be read: ${reason(e)}` });
      }
    }

    // Nothing usable for this vendor — don't emit an empty record.
    if (!contract && invoices.length === 0) continue;

    vendors.push({
      vendor: { id: S.slug(vendorName), name: vendorName, category: contract?.category ?? "", aliases },
      contract,
      invoices,
      usage,
    });
  }

  return DatasetSchema.parse({ customer, analysisDate, vendors });
}

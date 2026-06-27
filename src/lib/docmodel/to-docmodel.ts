/**
 * canonical -> DocModel. Drives document generation: every field the rules need
 * is emitted as a labelled field or a table row. Null/empty terms are omitted
 * (and reconstructed as null on the way back).
 */
import type {
  Contract,
  Invoice,
  UsageRecord,
  VendorRecord,
  DocModel,
  DocField,
  PaymentTerm,
} from "../types";
import { F, T } from "./labels";
import * as S from "./serialize";

class Fields {
  private out: DocField[] = [];
  push(label: string, value: string | null | undefined) {
    if (value !== null && value !== undefined && value !== "") {
      this.out.push({ label, value });
    }
  }
  build(): DocField[] {
    return this.out;
  }
}

export function formatPaymentTerms(p: PaymentTerm): string {
  if (p.discountPct > 0 && p.discountDays > 0) {
    return `${Number((p.discountPct * 100).toFixed(4))}/${p.discountDays} Net ${p.netDays}`;
  }
  return `Net ${p.netDays}`;
}

/**
 * Human-readable clause prose generated from the structured terms. Render-only:
 * the parser reads data from fields/tables, so clauses make the document read
 * like a real agreement without being part of the parse contract.
 */
export function contractClauses(c: Contract): { heading: string; body: string }[] {
  const out: { heading: string; body: string }[] = [];
  const renew = c.autoRenew
    ? `This Agreement automatically renews for successive ${c.renewalTermMonths}-month terms unless either party provides written notice of non-renewal at least ${c.noticeWindowDays} days prior to the end of the then-current term.`
    : `This Agreement expires at the end of the Initial Term unless renewed in writing by the parties.`;
  out.push({
    heading: "1. Term and Renewal",
    body: `The initial term of this Agreement is ${c.initialTermMonths} months, commencing on ${c.effectiveDate} and continuing through ${c.endDate} (the "Initial Term"). ${renew}`,
  });
  out.push({
    heading: "2. Fees and Payment",
    body: `Customer shall pay the fees set out in the Rate Card and Order Form, with a current annual contract value as stated above. Invoices are payable per the stated payment terms. All fees are exclusive of applicable taxes.`,
  });
  if (c.escalator && c.escalator.type !== "none") {
    const cap = c.escalator.capPct !== null ? ` Any such increase shall not exceed ${Math.round(c.escalator.capPct * 100)}% per annum.` : "";
    out.push({
      heading: "3. Price Adjustment",
      body: `Fees may be adjusted at each anniversary of the Effective Date in accordance with the escalation terms stated above.${cap}`,
    });
  }
  if (c.commitment?.minCommitSpendCents != null || c.commitment?.minCommitQty != null) {
    out.push({
      heading: "4. Minimum Commitment",
      body: `Customer commits to the minimum stated above over each measurement period. Consumption below the committed minimum remains payable in full.`,
    });
  }
  out.push({
    heading: "5. Audit Rights",
    body: `Customer may, on reasonable notice, audit invoices and supporting records against the rate card and order form for a period of twenty-four (24) months following each invoice date, and any confirmed overcharge shall be credited or refunded.`,
  });
  if (c.governingLaw) {
    out.push({
      heading: "6. Governing Law",
      body: `This Agreement is governed by the laws of ${c.governingLaw}, without regard to its conflict-of-laws principles.`,
    });
  }
  return out;
}

export function contractToDocModel(c: Contract): DocModel {
  const f = new Fields();
  f.push(F.contractId, c.id);
  f.push(F.vendor, c.vendorName);
  f.push(F.customer, c.customer);
  f.push(F.category, c.category);
  f.push(F.effectiveDate, c.effectiveDate);
  f.push(F.endDate, c.endDate);
  f.push(F.initialTerm, S.num(c.initialTermMonths));
  f.push(F.autoRenew, S.bool(c.autoRenew));
  f.push(F.noticeWindow, S.num(c.noticeWindowDays));
  f.push(F.noticeMethod, c.noticeMethod);
  f.push(F.renewalTerm, S.num(c.renewalTermMonths));
  if (c.earlyTermFeeCents > 0) f.push(F.earlyTermFee, S.money(c.earlyTermFeeCents));
  f.push(F.governingLaw, c.governingLaw);
  f.push(F.annualValue, S.money(c.currentAnnualValueCents));
  f.push(F.paymentTerms, formatPaymentTerms(c.payment));

  if (c.escalator && c.escalator.type !== "none") {
    f.push(F.escalatorType, c.escalator.type);
    if (c.escalator.fixedPct !== null) f.push(F.escalatorFixed, S.pct(c.escalator.fixedPct));
    if (c.escalator.cpiPlusPct !== null) f.push(F.escalatorCpiPlus, S.pct(c.escalator.cpiPlusPct));
    if (c.escalator.capPct !== null) f.push(F.escalatorCap, S.pct(c.escalator.capPct));
    if (c.escalator.anniversaryMonth !== null)
      f.push(F.escalatorMonth, S.num(c.escalator.anniversaryMonth));
  }

  if (c.commitment) {
    const m = c.commitment;
    if (m.minCommitSpendCents !== null) f.push(F.minCommitSpend, S.money(m.minCommitSpendCents));
    if (m.minCommitQty !== null) f.push(F.minCommitQty, S.num(m.minCommitQty));
    f.push(F.measurementPeriod, m.measurementPeriod);
    if (m.includedAllowance !== null) f.push(F.includedAllowance, S.num(m.includedAllowance));
    if (m.overageUnitPriceCents !== null) f.push(F.overagePrice, S.money(m.overageUnitPriceCents));
    if (m.contractedSeats !== null) f.push(F.contractedSeats, S.num(m.contractedSeats));
    f.push(F.planTier, m.tier);
    if (m.tierPricePerSeatCents !== null)
      f.push(F.tierPricePerSeat, S.money(m.tierPricePerSeatCents));
  }

  if (c.capabilityTags.length) f.push(F.capabilityTags, S.list(c.capabilityTags));
  if (c.scheduledHoursPerWeek !== null) f.push(F.scheduledHours, S.num(c.scheduledHoursPerWeek));
  if (c.holidayCalendar.length) f.push(F.holidayCalendar, S.list(c.holidayCalendar));
  if (c.feePctOfBase !== null) f.push(F.feePctOfBase, S.pct(c.feePctOfBase));
  if (c.pepmRateCents !== null) f.push(F.pepmRate, S.money(c.pepmRateCents));

  if (c.signatory) {
    f.push(F.signedBy, c.signatory.name);
    f.push(F.signedTitle, c.signatory.title);
    f.push(F.signedDate, c.signatory.date);
  }

  const tables: DocModel["tables"] = [];
  if (c.rateCard.length) {
    tables.push({
      name: T.rateCard.name,
      columns: [...T.rateCard.columns],
      rows: c.rateCard.map((r) => [
        r.sku,
        r.description,
        r.uom,
        S.money(r.unitPriceCents),
        r.tierMin !== null ? S.num(r.tierMin) : "",
        r.tierMax !== null ? S.num(r.tierMax) : "",
        r.tierBaseFeeCents !== null ? S.money(r.tierBaseFeeCents) : "",
        r.effectiveFrom ?? "",
        r.effectiveTo ?? "",
      ]),
    });
  }
  if (c.tiers.length) {
    tables.push({
      name: T.tiers.name,
      columns: [...T.tiers.columns],
      rows: c.tiers.map((t) => [
        S.num(t.tierMin),
        t.tierMax !== null ? S.num(t.tierMax) : "",
        S.money(t.baseFeeCents),
        S.money(t.unitPriceCents),
        t.overageRateCents !== null ? S.money(t.overageRateCents) : "",
      ]),
    });
  }
  if (c.seasonWindows.length) {
    tables.push({
      name: T.seasons.name,
      columns: [...T.seasons.columns],
      rows: c.seasonWindows.map((s) => [s.service, S.num(s.startMonth), S.num(s.endMonth)]),
    });
  }
  if (c.featureCatalog.length) {
    tables.push({
      name: T.features.name,
      columns: [...T.features.columns],
      rows: c.featureCatalog.map((x) => [x.feature, x.minTier]),
    });
  }

  return {
    docType: "contract",
    format: "pdf",
    vendorName: c.vendorName,
    title: `Master Services Agreement — ${c.vendorName}`,
    fields: f.build(),
    tables,
    clauses: contractClauses(c),
    fileName: c.sourceDoc,
  };
}

export function invoiceToDocModel(inv: Invoice): DocModel {
  const f = new Fields();
  f.push(F.invoiceNumber, inv.invoiceNumber);
  f.push(F.vendor, inv.vendorName);
  f.push(F.invoiceDate, inv.invoiceDate);
  f.push(F.dueDate, inv.dueDate);
  f.push(F.poNumber, inv.poNumber);
  f.push(F.billingStart, inv.billingPeriodStart);
  f.push(F.billingEnd, inv.billingPeriodEnd);
  f.push(F.billTo, inv.billTo);
  f.push(F.remitTo, inv.remitTo);
  f.push(F.ein, inv.ein);
  f.push(F.currency, inv.currency);
  if (inv.paymentTerms) f.push(F.paymentTerms, formatPaymentTerms(inv.paymentTerms));
  f.push(F.actualPayDate, inv.actualPayDate);
  f.push(F.subtotal, S.money(inv.subtotalCents));
  f.push(F.tax, S.money(inv.taxCents));
  f.push(F.total, S.money(inv.totalCents));

  return {
    docType: "invoice",
    format: "pdf",
    vendorName: inv.vendorName,
    title: `Invoice ${inv.invoiceNumber} — ${inv.vendorName}`,
    fields: f.build(),
    tables: [
      {
        name: T.lineItems.name,
        columns: [...T.lineItems.columns],
        rows: inv.lines.map((l) => [
          l.description,
          l.sku ?? "",
          l.uom,
          S.num(l.qty),
          S.money(l.unitPriceCents),
          S.money(l.lineTotalCents),
          l.lineType,
          l.assetId ?? "",
          l.serviceDate ?? "",
          l.laborType ?? "",
        ]),
      },
    ],
    clauses: [],
    fileName: inv.sourceDoc,
  };
}

export function usageToDocModel(
  vendorName: string,
  fileName: string,
  records: UsageRecord[],
): DocModel {
  const f = new Fields();
  f.push(F.vendor, vendorName);
  f.push(F.exportType, records[0]?.kind ?? "seat");

  return {
    docType: "usage_export",
    format: "excel",
    vendorName,
    title: `Utilization Export — ${vendorName}`,
    fields: f.build(),
    tables: [
      {
        name: T.usage.name,
        columns: [...T.usage.columns],
        rows: records.map((r) => [
          r.kind,
          r.identifier,
          r.status ?? "",
          r.lastActiveDate ?? "",
          S.bool(r.provisioned),
          r.feature ?? "",
          r.used === null ? "" : S.bool(r.used),
          r.tier ?? "",
          r.period ?? "",
          r.count !== null ? S.num(r.count) : "",
          r.decommissionDate ?? "",
        ]),
      },
    ],
    clauses: [],
    fileName,
  };
}

/** All document representations for one vendor (contract + invoices + usage). */
export function vendorRecordToDocModels(vr: VendorRecord): DocModel[] {
  const docs: DocModel[] = [];
  if (vr.contract) {
    const contractDoc = contractToDocModel(vr.contract);
    // Carry vendor aliases (used by R06 entity-matching) on the contract doc so
    // they survive the document round-trip — the canonical Contract has none.
    if (vr.vendor.aliases.length) {
      const idx = contractDoc.fields.findIndex((f) => f.label === F.vendor);
      const aliasField = { label: F.vendorAliases, value: S.list(vr.vendor.aliases) };
      contractDoc.fields.splice(idx >= 0 ? idx + 1 : contractDoc.fields.length, 0, aliasField);
    }
    docs.push(contractDoc);
  }
  for (const inv of vr.invoices) docs.push(invoiceToDocModel(inv));
  if (vr.usage.length) {
    const fileName = `${S.slug(vr.vendor.name)}-utilization.xlsx`;
    docs.push(usageToDocModel(vr.vendor.name, fileName, vr.usage));
  }
  return docs;
}

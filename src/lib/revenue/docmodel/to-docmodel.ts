/**
 * canonical REVENUE record -> DocModel. Mirror of ../../docmodel/to-docmodel,
 * seller-side. Every field the revenue rules need is emitted as a labelled field
 * or a table row. Null/empty terms are omitted (and reconstructed as null/[] on
 * the way back) so canonical -> DocModel -> canonical is an identity.
 */
import type { DocModel, DocField, PaymentTerm } from "../../types";
import type {
  CustomerContract,
  BillingDoc,
  ARAgingRecord,
  WorkOrder,
  CustomerRecord,
} from "../types";
import { RF, RT } from "./labels";
import { formatPaymentTerms } from "../../docmodel/to-docmodel";
import * as S from "../../docmodel/serialize";

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

/**
 * Human-readable clause prose generated from the structured terms, in the
 * SELLER's voice. Render-only: the parser reads data from fields/tables, so
 * clauses make the document read like a real agreement without being part of the
 * parse contract.
 */
export function revenueContractClauses(
  c: CustomerContract,
): { heading: string; body: string }[] {
  const out: { heading: string; body: string }[] = [];
  const renew = c.autoRenew
    ? `This Agreement automatically renews for successive ${c.renewalTermMonths}-month terms unless the Customer provides written notice of non-renewal at least ${c.noticeWindowDays} days prior to the end of the then-current term.`
    : `This Agreement expires at the end of the Initial Term unless renewed in writing by the parties.`;
  out.push({
    heading: "1. Term and Renewal",
    body: `The initial term of this Agreement is ${c.initialTermMonths} months, commencing on ${c.effectiveDate} and continuing through ${c.endDate} (the "Initial Term"). ${renew}`,
  });
  out.push({
    heading: "2. Fees and Payment",
    body: `Customer shall pay ${c.seller} the fees set out in the Rate Card and Order Form, with a current annual contract value as stated above. Invoices are payable per the stated payment terms. All fees are exclusive of applicable taxes.`,
  });
  if (c.escalator && c.escalator.type !== "none") {
    const cap =
      c.escalator.capPct !== null
        ? ` Any such increase shall not exceed ${Math.round(c.escalator.capPct * 100)}% per annum.`
        : "";
    const floor =
      c.escalator.floorPct !== null
        ? ` In no event shall the annual adjustment be less than ${Math.round(c.escalator.floorPct * 100)}%.`
        : "";
    out.push({
      heading: "3. Price Adjustment",
      body: `Fees shall be adjusted at each anniversary of the Effective Date in accordance with the escalation terms stated above.${cap}${floor}`,
    });
  }
  if (c.priceIncreaseSchedule.length) {
    out.push({
      heading: "4. Scheduled List-Price Increases",
      body: `The parties acknowledge the scheduled list-price increases set out in the Price Increase Schedule, which the Seller is entitled to bill on and after each stated effective date.`,
    });
  }
  if (c.introDiscount) {
    out.push({
      heading: "5. Introductory Discount",
      body: `An introductory discount of ${Math.round(c.introDiscount.pct * 100)}% applies through ${c.introDiscount.expiryDate}, after which list pricing resumes automatically.`,
    });
  }
  if (c.surcharges.length) {
    out.push({
      heading: "6. Surcharges and Pass-Throughs",
      body: `Seller is entitled to bill the surcharges and pass-throughs set out in the Surcharges schedule, computed on the stated basis.`,
    });
  }
  if (c.commitment?.minCommitSpendCents != null || c.commitment?.minCommitQty != null) {
    out.push({
      heading: "7. Minimum Commitment",
      body: `Customer commits to the minimum stated above over each measurement period. Consumption below the committed minimum remains payable in full.`,
    });
  }
  out.push({
    heading: "8. Audit and True-Up",
    body: `Seller may, on reasonable notice, true up invoices and supporting records against the rate card and order form for a period of ${c.auditWindowMonths} months following each invoice date, and any confirmed under-charge shall be invoiced retroactively.`,
  });
  if (c.latePaymentInterestPct !== null) {
    out.push({
      heading: "9. Late Payment",
      body: `Past-due balances accrue interest at ${Number((c.latePaymentInterestPct * 100).toFixed(4))}% per month from the due date until paid.`,
    });
  }
  if (c.governingLaw) {
    out.push({
      heading: "10. Governing Law",
      body: `This Agreement is governed by the laws of ${c.governingLaw}, without regard to its conflict-of-laws principles.`,
    });
  }
  return out;
}

export function customerContractToDocModel(c: CustomerContract): DocModel {
  const f = new Fields();
  f.push(RF.contractId, c.id);
  f.push(RF.seller, c.seller);
  f.push(RF.customer, c.customerName);
  f.push(RF.segment, c.segment);
  f.push(RF.effectiveDate, c.effectiveDate);
  f.push(RF.endDate, c.endDate);
  f.push(RF.initialTerm, S.num(c.initialTermMonths));
  f.push(RF.autoRenew, S.bool(c.autoRenew));
  f.push(RF.noticeWindow, S.num(c.noticeWindowDays));
  f.push(RF.noticeMethod, c.noticeMethod);
  f.push(RF.renewalTerm, S.num(c.renewalTermMonths));
  f.push(RF.governingLaw, c.governingLaw);
  f.push(RF.auditWindow, S.num(c.auditWindowMonths));
  f.push(RF.annualValue, S.money(c.currentAnnualValueCents));
  f.push(RF.paymentTerms, formatPaymentTerms(c.payment));

  if (c.escalator) {
    const e = c.escalator;
    f.push(RF.escalatorType, e.type);
    if (e.fixedPct !== null) f.push(RF.escalatorFixed, S.pct(e.fixedPct));
    if (e.indexPlusPct !== null) f.push(RF.escalatorIndexPlus, S.pct(e.indexPlusPct));
    if (e.capPct !== null) f.push(RF.escalatorCap, S.pct(e.capPct));
    if (e.floorPct !== null) f.push(RF.escalatorFloor, S.pct(e.floorPct));
    if (e.anniversaryMonth !== null) f.push(RF.escalatorMonth, S.num(e.anniversaryMonth));
    if (e.baseIndexYear !== null) f.push(RF.escalatorBaseYear, S.num(e.baseIndexYear));
    // compounding has a non-null default (true); always emit so it round-trips.
    f.push(RF.escalatorCompounding, S.bool(e.compounding));
  }

  if (c.introDiscount) {
    f.push(RF.introDiscountPct, S.pct(c.introDiscount.pct));
    f.push(RF.introDiscountExpiry, c.introDiscount.expiryDate);
    f.push(RF.introDiscountSku, c.introDiscount.appliesToSku);
  }

  if (c.latePaymentInterestPct !== null) {
    f.push(RF.latePaymentInterest, S.pct(c.latePaymentInterestPct));
  }

  if (c.commitment) {
    const m = c.commitment;
    if (m.minCommitSpendCents !== null) f.push(RF.minCommitSpend, S.money(m.minCommitSpendCents));
    if (m.minCommitQty !== null) f.push(RF.minCommitQty, S.num(m.minCommitQty));
    f.push(RF.measurementPeriod, m.measurementPeriod);
    if (m.includedAllowance !== null) f.push(RF.includedAllowance, S.num(m.includedAllowance));
    if (m.overageUnitPriceCents !== null) f.push(RF.overagePrice, S.money(m.overageUnitPriceCents));
    if (m.contractedSeats !== null) f.push(RF.contractedSeats, S.num(m.contractedSeats));
    f.push(RF.planTier, m.tier);
    if (m.tierPricePerSeatCents !== null)
      f.push(RF.tierPricePerSeat, S.money(m.tierPricePerSeatCents));
  }

  if (c.signatory) {
    f.push(RF.signedBy, c.signatory.name);
    f.push(RF.signedTitle, c.signatory.title);
    f.push(RF.signedDate, c.signatory.date);
  }

  const tables: DocModel["tables"] = [];
  if (c.rateCard.length) {
    tables.push({
      name: RT.rateCard.name,
      columns: [...RT.rateCard.columns],
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
      name: RT.tiers.name,
      columns: [...RT.tiers.columns],
      rows: c.tiers.map((t) => [
        S.num(t.tierMin),
        t.tierMax !== null ? S.num(t.tierMax) : "",
        S.money(t.baseFeeCents),
        S.money(t.unitPriceCents),
        t.overageRateCents !== null ? S.money(t.overageRateCents) : "",
      ]),
    });
  }
  if (c.priceIncreaseSchedule.length) {
    tables.push({
      name: RT.priceSchedule.name,
      columns: [...RT.priceSchedule.columns],
      rows: c.priceIncreaseSchedule.map((p) => [
        p.effectiveDate,
        S.money(p.newUnitPriceCents),
        p.sku ?? "",
        p.note ?? "",
      ]),
    });
  }
  if (c.surcharges.length) {
    tables.push({
      name: RT.surcharges.name,
      columns: [...RT.surcharges.columns],
      rows: c.surcharges.map((s) => [
        s.kind,
        s.label,
        s.basis,
        s.ratePct !== null ? S.pct(s.ratePct) : "",
        s.perUnitCents !== null ? S.money(s.perUnitCents) : "",
      ]),
    });
  }

  return {
    docType: "customer_contract",
    format: "pdf",
    vendorName: c.customerName,
    title: `Master Services Agreement — ${c.customerName}`,
    fields: f.build(),
    tables,
    clauses: revenueContractClauses(c),
    fileName: c.sourceDoc,
  };
}

export function billingToDocModel(b: BillingDoc): DocModel {
  const f = new Fields();
  f.push(RF.billingNumber, b.billingNumber);
  f.push(RF.customer, b.customerName);
  f.push(RF.invoiceDate, b.invoiceDate);
  f.push(RF.dueDate, b.dueDate);
  f.push(RF.poNumber, b.poNumber);
  f.push(RF.billingStart, b.billingPeriodStart);
  f.push(RF.billingEnd, b.billingPeriodEnd);
  f.push(RF.billTo, b.billTo);
  f.push(RF.remitTo, b.remitTo);
  f.push(RF.currency, b.currency);
  if (b.paymentTerms) f.push(RF.paymentTerms, formatPaymentTerms(b.paymentTerms));
  f.push(RF.paidDate, b.paidDate);
  f.push(RF.subtotal, S.money(b.subtotalCents));
  f.push(RF.tax, S.money(b.taxCents));
  f.push(RF.total, S.money(b.totalCents));

  return {
    docType: "billing_export",
    format: "pdf",
    vendorName: b.customerName,
    title: `Billing Document ${b.billingNumber} — ${b.customerName}`,
    fields: f.build(),
    tables: [
      {
        name: RT.lineItems.name,
        columns: [...RT.lineItems.columns],
        rows: b.lines.map((l) => [
          l.description,
          l.sku ?? "",
          l.uom,
          S.num(l.qty),
          S.money(l.unitPriceCents),
          S.money(l.lineTotalCents),
          l.lineType,
          l.workOrderId ?? "",
          l.assetId ?? "",
          l.serviceDate ?? "",
        ]),
      },
    ],
    clauses: [],
    fileName: b.sourceDoc,
  };
}

/**
 * Statement of account: AR aging + Work Order Register for one customer. Both
 * tables are emitted even if one is empty, and the "AR Statement Date" marker
 * field is always present so the PDF parser can detect the doc type.
 */
export function statementToDocModel(
  customerName: string,
  fileName: string,
  arAging: ARAgingRecord[],
  workOrders: WorkOrder[],
): DocModel {
  const f = new Fields();
  f.push(RF.customer, customerName);

  const fields = f.build();
  // Always carry the AR Statement Date marker, even with an empty value: the PDF
  // parser keys on its PRESENCE (Fields would omit a pushed "" value).
  fields.push({ label: RF.arStatementDate, value: "" });

  return {
    docType: "ar_aging",
    format: "excel",
    vendorName: customerName,
    title: `Statement of Account — ${customerName}`,
    fields,
    tables: [
      {
        name: RT.arAging.name,
        columns: [...RT.arAging.columns],
        rows: arAging.map((a) => [
          a.invoiceNumber,
          a.invoiceDate,
          a.dueDate,
          S.money(a.balanceCents),
          S.num(a.ageDays),
          a.bucket,
          S.bool(a.disputed),
          a.promiseToPayDate ?? "",
          S.bool(a.promiseBroken),
          S.bool(a.partialPayment),
          S.num(a.priorWriteOffs),
        ]),
      },
      {
        name: RT.workOrders.name,
        columns: [...RT.workOrders.columns],
        rows: workOrders.map((w) => [
          w.workOrderId,
          w.serviceDate,
          w.description,
          w.sku ?? "",
          w.uom,
          S.num(w.qty),
          S.money(w.contractedUnitPriceCents),
          w.status,
        ]),
      },
    ],
    clauses: [],
    fileName,
  };
}

/**
 * All document representations for one customer: contract + each billing + ONE
 * statement doc (when arAging or workOrders is non-empty). Customer aliases are
 * carried on the contract doc (the canonical CustomerContract has none) so they
 * survive the round-trip, mirroring vendorRecordToDocModels.
 */
export function customerRecordToDocModels(record: CustomerRecord): DocModel[] {
  const docs: DocModel[] = [];
  if (record.contract) {
    const contractDoc = customerContractToDocModel(record.contract);
    if (record.customer.aliases.length) {
      const idx = contractDoc.fields.findIndex((x) => x.label === RF.customer);
      const aliasField = {
        label: RF.customerAliases,
        value: S.list(record.customer.aliases),
      };
      contractDoc.fields.splice(
        idx >= 0 ? idx + 1 : contractDoc.fields.length,
        0,
        aliasField,
      );
    }
    docs.push(contractDoc);
  }
  for (const b of record.billings) docs.push(billingToDocModel(b));
  if (record.arAging.length || record.workOrders.length) {
    const fileName = `${S.slug(record.customer.name)}-statement.xlsx`;
    docs.push(
      statementToDocModel(
        record.customer.name,
        fileName,
        record.arAging,
        record.workOrders,
      ),
    );
  }
  return docs;
}

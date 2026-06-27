/**
 * R06 — Duplicate / Double Billing.
 *
 * Within a single vendor's invoices, finds the same charge invoiced more than
 * once. Two detectors (per docs/DETECTION-RULES.md):
 *   EXACT — two invoices share the same normalized invoice number AND an equal
 *           absolute amount (totalCents). High confidence, low controversy.
 *   FUZZY — entity-normalized vendor match (always true within a vendor record)
 *           AND amounts within CONFIG.dupAmountTolPct AND invoice dates within
 *           CONFIG.dupDateDays AND invoice-number similarity >=
 *           CONFIG.fuzzyMatchThreshold (catches "INV-1024" vs "INV1024").
 *
 * A duplicate is a pure cash recovery: the customer is owed one copy back, so
 * recoverableToDateCents == annualizedSavingsCents == the duplicated amount
 * (one copy), and savingsType is 'recovery'.
 */
import { perVendorRule } from "./types";
import { makeFinding } from "./types";
import {
  normalizeEntity,
  normalizeInvoiceNumber,
  similarity,
} from "./util";
import type { Invoice } from "../types";
import { formatUSD } from "../money";

interface DupPair {
  a: Invoice;
  b: Invoice;
  amountCents: number;
  kind: "exact" | "fuzzy";
}

export default perVendorRule(
  "R06",
  "Duplicate / Double Billing",
  "duplicate",
  (vendor, ctx) => {
    const { config } = ctx;
    const invoices = vendor.invoices;
    if (invoices.length < 2) return [];

    const seen = new Set<string>(); // invoices already claimed by a duplicate
    const pairs: DupPair[] = [];

    const key = (inv: Invoice) =>
      `${inv.id}::${inv.sourceDoc}::${inv.invoiceNumber}`;

    for (let i = 0; i < invoices.length; i++) {
      const a = invoices[i];
      if (seen.has(key(a))) continue;
      for (let j = i + 1; j < invoices.length; j++) {
        const b = invoices[j];
        if (seen.has(key(b))) continue;

        const numA = normalizeInvoiceNumber(a.invoiceNumber);
        const numB = normalizeInvoiceNumber(b.invoiceNumber);
        const absA = Math.abs(a.totalCents);
        const absB = Math.abs(b.totalCents);

        // EXACT: same normalized number AND equal absolute amount.
        const exact = numA === numB && absA === absB;

        // FUZZY: same entity + amount within tol + dates within window +
        // invoice-number similarity above the shared fuzzy threshold.
        const sameEntity =
          normalizeEntity(a.vendorName) === normalizeEntity(b.vendorName);
        const amtBase = Math.max(absA, absB) || 1;
        const amtClose =
          Math.abs(absA - absB) / amtBase <= config.dupAmountTolPct;
        const datesClose =
          Math.abs(
            (Date.parse(a.invoiceDate) - Date.parse(b.invoiceDate)) /
              86_400_000,
          ) <= config.dupDateDays;
        const numClose =
          similarity(numA, numB) >= config.fuzzyMatchThreshold;
        const fuzzy = sameEntity && amtClose && datesClose && numClose;

        if (exact || fuzzy) {
          seen.add(key(a));
          seen.add(key(b));
          pairs.push({
            a,
            b,
            amountCents: Math.max(absA, absB),
            kind: exact ? "exact" : "fuzzy",
          });
          break; // a is consumed; move to the next invoice
        }
      }
    }

    if (pairs.length === 0) return [];

    // One finding per vendor; sum the recoverable across all duplicate pairs.
    const recoverable = pairs.reduce((s, p) => s + p.amountCents, 0);
    const anyExact = pairs.some((p) => p.kind === "exact");
    const confidence = anyExact ? 0.96 : 0.9;

    const evidence = pairs.flatMap((p) => {
      const label =
        p.kind === "exact" ? "Exact duplicate" : "Near-duplicate (fuzzy)";
      return [
        {
          label: `${label}: invoice ${p.a.invoiceNumber}`,
          value: `${formatUSD(p.a.totalCents)} — invoice dated ${p.a.invoiceDate}`,
          sourceDoc: p.a.sourceDoc,
        },
        {
          label: `${label}: invoice ${p.b.invoiceNumber} (second copy)`,
          value: `${formatUSD(p.b.totalCents)} — invoice dated ${p.b.invoiceDate}`,
          sourceDoc: p.b.sourceDoc,
        },
      ];
    });

    const numbers = Array.from(
      new Set(pairs.map((p) => p.a.invoiceNumber)),
    ).join(", ");

    const title =
      pairs.length === 1
        ? `Duplicate invoice ${pairs[0].a.invoiceNumber} billed twice`
        : `${pairs.length} duplicate invoices billed twice`;

    const summary =
      `Invoice ${numbers} from ${vendor.vendor.name} appears more than once for the same ` +
      `amount (${formatUSD(recoverable)} per copy). The duplicate copy is a double-bill: the ` +
      `charge was invoiced ${anyExact ? "with an identical number and amount" : "as a near-identical near-duplicate"}, ` +
      `so one full copy (${formatUSD(recoverable)}) is recoverable as a cash credit.`;

    return [
      makeFinding({
        ruleId: "R06",
        ruleName: "Duplicate / Double Billing",
        category: "duplicate",
        vendorId: vendor.vendor.id,
        vendorName: vendor.vendor.name,
        title,
        summary,
        savingsType: "recovery",
        annualizedSavingsCents: recoverable,
        recoverableToDateCents: recoverable,
        confidence,
        severity: "high",
        leverage:
          "A clean duplicate is low-controversy, fast cash recovery — vendors rarely dispute it. " +
          "Use it to also secure a three-way-match + audit-rights clause for future invoices.",
        evidence,
        recommendedAsk:
          `Request a credit memo / cash refund of ${formatUSD(recoverable)} for the duplicated ` +
          `invoice ${numbers}, and confirm both copies were not separately remitted.`,
      }),
    ];
  },
);

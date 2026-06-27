/**
 * Shared helpers used across several rules: a date- and SKU-aware rate-card
 * line matcher (R02/R05/R07), fuzzy string similarity + entity normalization
 * (R06), and small consumption/period helpers. Centralized so matching behaves
 * identically everywhere and carries a confidence score.
 */
import { distance } from "fastest-levenshtein";
import type { RateCardLine, Invoice, InvoiceLine } from "../types";
import { daysBetween, type ISODate } from "../dates";
import { CONFIG } from "../config";

/** 0..1 similarity (1 = identical) from normalized Levenshtein distance. */
export function similarity(a: string, b: string): number {
  const x = a.trim().toLowerCase();
  const y = b.trim().toLowerCase();
  if (!x && !y) return 1;
  const max = Math.max(x.length, y.length);
  if (max === 0) return 1;
  return 1 - distance(x, y) / max;
}

/** Strip legal suffixes/punctuation so "Acme, Inc." and "Acme LLC" compare equal. */
export function normalizeEntity(name: string): string {
  return name
    .toLowerCase()
    .replace(/[.,]/g, " ")
    .replace(/\b(inc|incorporated|llc|l\.l\.c|ltd|limited|corp|corporation|co|company|plc|lp|llp|gmbh)\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Normalize an invoice number for comparison ("INV-1024" ~ "INV1024"). */
export function normalizeInvoiceNumber(n: string): string {
  return n.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export interface RateMatch {
  rate: RateCardLine | null;
  confidence: number;
}

/**
 * Resolve the rate-card line that governs an invoice line: exact SKU first
 * (confidence 1), else the best description match above the fuzzy threshold,
 * preferring rows whose effective window contains the invoice date.
 */
export function matchRateCardLine(
  rateCard: RateCardLine[],
  line: Pick<InvoiceLine, "sku" | "description" | "uom">,
  opts: { date?: ISODate; threshold?: number } = {},
): RateMatch {
  const threshold = opts.threshold ?? CONFIG.fuzzyMatchThreshold;
  const effective = (r: RateCardLine) => {
    if (!opts.date) return true;
    const fromOk = !r.effectiveFrom || daysBetween(r.effectiveFrom, opts.date) >= 0;
    const toOk = !r.effectiveTo || daysBetween(opts.date, r.effectiveTo) >= 0;
    return fromOk && toOk;
  };

  if (line.sku) {
    const exact = rateCard.filter((r) => r.sku === line.sku);
    const dated = exact.find(effective) ?? exact[0];
    if (dated) return { rate: dated, confidence: 1 };
  }

  let best: RateCardLine | null = null;
  let bestScore = 0;
  for (const r of rateCard) {
    const score = similarity(r.description, line.description) * (effective(r) ? 1 : 0.9);
    if (score > bestScore) {
      bestScore = score;
      best = r;
    }
  }
  if (best && bestScore >= threshold) return { rate: best, confidence: bestScore };
  return { rate: null, confidence: bestScore };
}

/** Sum the line totals of a given type across an invoice. */
export function sumLineType(inv: Invoice, type: InvoiceLine["lineType"]): number {
  return inv.lines.filter((l) => l.lineType === type).reduce((a, l) => a + l.lineTotalCents, 0);
}

/** Total of all invoice grand totals (a consumption/run-rate proxy). */
export function invoicesTotal(invoices: Invoice[]): number {
  return invoices.reduce((a, i) => a + i.totalCents, 0);
}

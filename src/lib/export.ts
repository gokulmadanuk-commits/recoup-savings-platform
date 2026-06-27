/**
 * Export helpers — turn an AnalysisResult into a forwardable CSV and trigger a
 * client-side download. Pure module (no React, no "use client"): the CSV
 * builder is environment-agnostic; the download helper guards on `document` so
 * importing this file never crashes during SSR.
 */
import type { AnalysisResult, Finding } from "./types";
import { toDollars } from "./money";

const CSV_HEADER = [
  "vendor",
  "category",
  "rule",
  "title",
  "savingsType",
  "annualizedUSD",
  "recoverableUSD",
] as const;

/** RFC-4180 quote: wrap in quotes when the value contains a comma, quote, or newline. */
function csvCell(value: string | number): string {
  const s = String(value);
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

/** Dollars with two decimals and no grouping/symbol — clean for spreadsheets. */
function dollars(cents: number): string {
  return toDollars(cents).toFixed(2);
}

function findingRow(f: Finding): string {
  return [
    csvCell(f.vendorName),
    csvCell(f.category),
    csvCell(f.ruleName),
    csvCell(f.title),
    csvCell(f.savingsType),
    csvCell(dollars(f.annualizedSavingsCents)),
    csvCell(dollars(f.recoverableToDateCents)),
  ].join(",");
}

/**
 * One header row plus one row per finding, ranked by annualized savings (desc)
 * so the most valuable lines sit at the top of the export.
 */
export function findingsToCsv(result: AnalysisResult): string {
  const rows = [...result.findings].sort(
    (a, b) => b.annualizedSavingsCents - a.annualizedSavingsCents,
  );
  const lines = [CSV_HEADER.join(","), ...rows.map(findingRow)];
  return lines.join("\r\n");
}

/**
 * Trigger a browser download of `text` as `filename`. No-op in non-DOM
 * environments (SSR / tests) so callers can import this module safely.
 */
export function downloadText(
  filename: string,
  text: string,
  mime = "text/csv;charset=utf-8",
): void {
  if (typeof document === "undefined") return;
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

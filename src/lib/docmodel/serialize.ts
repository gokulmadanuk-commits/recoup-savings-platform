/**
 * Value (de)serializers for DocModel field/table cells. Every value in a
 * DocModel is a STRING (what literally appears in the document); these convert
 * to/from canonical types losslessly so canonical -> DocModel -> canonical is
 * an identity. The format renderers/parsers only have to preserve the strings.
 */
import type { Cents } from "../money";
import { formatUSDPrecise } from "../money";

export function slug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/* money: 4860 <-> "$48.60", -50000 <-> "-$500.00", 125000 <-> "$1,250.00" */
export function money(cents: Cents): string {
  return formatUSDPrecise(cents);
}
export function parseMoney(s: string): Cents {
  const n = Number(s.replace(/[$,\s]/g, ""));
  return Math.round(n * 100);
}

/* percent: 0.04 <-> "4%", 0.085 <-> "8.5%", 0.032 <-> "3.2%" */
export function pct(fraction: number): string {
  return `${Number((fraction * 100).toFixed(4))}%`;
}
export function parsePct(s: string): number {
  return Number(s.replace(/[%\s]/g, "")) / 100;
}

export function bool(b: boolean): string {
  return b ? "Yes" : "No";
}
export function parseBool(s: string): boolean {
  return /^\s*y/i.test(s);
}

export function num(n: number): string {
  return String(n);
}
export function parseNum(s: string): number {
  return Number(String(s).replace(/,/g, "").trim());
}

/* pipe-joined lists — values (e.g. "Acme, Inc.") may themselves contain commas. */
const LIST_SEP = " | ";
export function list(items: string[]): string {
  return items.join(LIST_SEP);
}
export function parseList(s: string): string[] {
  const t = s.trim();
  if (!t) return [];
  return t
    .split("|")
    .map((x) => x.trim())
    .filter(Boolean);
}

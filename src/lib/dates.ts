/**
 * All dates flow as ISO "YYYY-MM-DD" strings (JSON-serializable, timezone-free).
 * Helpers wrap date-fns and always return/accept that shape.
 */
import {
  addDays as fnsAddDays,
  addMonths as fnsAddMonths,
  differenceInCalendarDays,
  differenceInCalendarMonths,
  parseISO,
  format,
  isValid,
} from "date-fns";

export type ISODate = string; // "YYYY-MM-DD"

export function parse(date: ISODate): Date {
  return parseISO(date);
}

export function toISO(date: Date): ISODate {
  return format(date, "yyyy-MM-dd");
}

export function isValidISO(date: string): boolean {
  return isValid(parseISO(date));
}

export function addDays(date: ISODate, days: number): ISODate {
  return toISO(fnsAddDays(parseISO(date), days));
}

export function addMonths(date: ISODate, months: number): ISODate {
  return toISO(fnsAddMonths(parseISO(date), months));
}

/** Calendar days from `from` to `to` (positive if `to` is later). */
export function daysBetween(from: ISODate, to: ISODate): number {
  return differenceInCalendarDays(parseISO(to), parseISO(from));
}

export function monthsBetween(from: ISODate, to: ISODate): number {
  return differenceInCalendarMonths(parseISO(to), parseISO(from));
}

/** "January 1, 2026" */
export function formatLong(date: ISODate): string {
  return format(parseISO(date), "MMMM d, yyyy");
}

/** "Jan 2026" */
export function formatMonthYear(date: ISODate): string {
  return format(parseISO(date), "MMM yyyy");
}

/** "2026-06" month key, for grouping/periods. */
export function monthKey(date: ISODate): string {
  return format(parseISO(date), "yyyy-MM");
}

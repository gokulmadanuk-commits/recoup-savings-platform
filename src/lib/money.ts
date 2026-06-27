/**
 * Money is handled as INTEGER CENTS everywhere (never floats), so cumulative
 * overcharges across 12+ months of invoices never drift. Convert to dollars
 * only at the display boundary.
 */
export type Cents = number;

export type BillingPeriod = "monthly" | "quarterly" | "annual" | "one_time";

const PERIODS_PER_YEAR: Record<BillingPeriod, number> = {
  monthly: 12,
  quarterly: 4,
  annual: 1,
  one_time: 1,
};

/** Dollars (possibly fractional) -> integer cents. */
export function toCents(dollars: number): Cents {
  return Math.round(dollars * 100);
}

/** Integer cents -> dollars (number). */
export function toDollars(cents: Cents): number {
  return cents / 100;
}

/** Multiply a cent amount by a percentage (e.g. 0.08) and round to whole cents. */
export function pctOfCents(cents: Cents, pct: number): Cents {
  return Math.round(cents * pct);
}

/** A unit price in cents times a (possibly fractional) quantity, rounded to cents. */
export function lineTotalCents(unitPriceCents: Cents, qty: number): Cents {
  return Math.round(unitPriceCents * qty);
}

/** Annualize a per-period amount into a comparable yearly figure. */
export function annualizeCents(amountPerPeriod: Cents, period: BillingPeriod): Cents {
  if (period === "one_time") return amountPerPeriod;
  return amountPerPeriod * PERIODS_PER_YEAR[period];
}

export function periodsPerYear(period: BillingPeriod): number {
  return PERIODS_PER_YEAR[period];
}

export function sumCents(values: Cents[]): Cents {
  return values.reduce((a, b) => a + b, 0);
}

const USD = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

const USD_PRECISE = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** "$8,640" — whole-dollar display for headline figures. */
export function formatUSD(cents: Cents): string {
  return USD.format(cents / 100);
}

/** "$48.60" — precise display for unit prices / line items. */
export function formatUSDPrecise(cents: Cents): string {
  return USD_PRECISE.format(cents / 100);
}

/** "1,234" grouped integer (for seat counts, quantities). */
export function formatQty(n: number): string {
  return new Intl.NumberFormat("en-US").format(n);
}

/** Format a fraction (0.085) as a percent string ("8.5%"). */
export function formatPct(fraction: number, digits = 1): string {
  return `${(fraction * 100).toFixed(digits)}%`;
}

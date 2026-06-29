/**
 * The escalator engine — pure, deterministic price-path math shared by RL01
 * (escalator-missed) and the uplift calendar. Given a base price, a base year,
 * and a RevenueEscalator, it projects the CORRECT price at each anniversary so
 * arrears (Σ correct − billed over elapsed years) and forward uplift
 * (correct_current − billed_current) can be computed against what was billed.
 *
 * Mechanics modelled:
 *   - fixed compound:        rate = fixedPct each year
 *   - index (cpi / rpi):     rate = series[Y]/series[Y-1] − 1   (YoY)
 *   - index + margin:        rate = indexYoY + indexPlusPct
 *   - greater_of:            rate = max(fixedPct, cpi YoY)
 *   - collar:                rate = clamp(rate, floorPct, capPct)  — applied LAST
 *
 * Index-linked-with-fixed-base is inherently compounding. We accumulate the
 * product of (1 + clamped rate) as a float and round the price ONCE per year
 * from the base, so a pure index path reproduces base × series[Y]/series[base]
 * exactly (no step-to-step rounding drift) while per-year collars still bind.
 */
import type { RevenueEscalator } from "./types";
import { CPI_U_SERIES, indexValue, seriesFor } from "./rpi";

export interface EscalatorProjectionInput {
  /** Price at the base year, before any escalation. */
  basePriceCents: number;
  /** The year escalation starts compounding from (typically effectiveDate's year). */
  baseYear: number;
  /** Project anniversaries up to and including this year. */
  throughYear: number;
  escalator: RevenueEscalator;
}

export interface AnniversaryStep {
  year: number;
  /** Pre-collar YoY rate for this anniversary. */
  rawRate: number;
  /** Applied rate after the floor/cap collar. */
  rate: number;
  /** Correct price after this anniversary's uplift. */
  priceCents: number;
}

export interface EscalatorProjection {
  basePriceCents: number;
  baseYear: number;
  steps: AnniversaryStep[];
  /** Correct price at `throughYear` (== basePriceCents when no anniversaries elapsed). */
  currentPriceCents: number;
}

function clamp(rate: number, floor: number | null, cap: number | null): number {
  let r = rate;
  if (floor !== null) r = Math.max(r, floor);
  if (cap !== null) r = Math.min(r, cap);
  return r;
}

/** The pre-collar YoY rate for a single anniversary `year`. */
function rawRateForYear(esc: RevenueEscalator, year: number): number {
  const fixed = esc.fixedPct ?? 0;
  const margin = esc.indexPlusPct ?? 0;
  const series = seriesFor(esc.type);
  const yoy = (s: NonNullable<ReturnType<typeof seriesFor>>) =>
    indexValue(s, year) / indexValue(s, year - 1) - 1;

  switch (esc.type) {
    case "fixed":
      return fixed;
    case "cpi":
    case "rpi":
      return series ? yoy(series) : 0;
    case "cpi_plus":
    case "rpi_plus":
      return (series ? yoy(series) : 0) + margin;
    case "greater_of":
      return Math.max(fixed, yoy(CPI_U_SERIES));
    case "none":
    default:
      return 0;
  }
}

/** Project the correct price path from the base year through `throughYear`. */
export function projectEscalator(
  input: EscalatorProjectionInput,
): EscalatorProjection {
  const { basePriceCents, baseYear, throughYear, escalator } = input;
  const steps: AnniversaryStep[] = [];
  let mult = 1;

  if (escalator.type !== "none") {
    for (let year = baseYear + 1; year <= throughYear; year++) {
      const rawRate = rawRateForYear(escalator, year);
      const rate = clamp(rawRate, escalator.floorPct, escalator.capPct);
      mult *= 1 + rate;
      // Round once from the base each year — avoids step-to-step rounding drift.
      const priceCents = Math.round(basePriceCents * mult);
      steps.push({ year, rawRate, rate, priceCents });
    }
  }

  return {
    basePriceCents,
    baseYear,
    steps,
    currentPriceCents: steps.length
      ? steps[steps.length - 1].priceCents
      : basePriceCents,
  };
}

export interface CatchUp {
  projection: EscalatorProjection;
  /** Per elapsed year: the correct price, what was billed, and the shortfall. */
  perYear: {
    year: number;
    correctCents: number;
    billedCents: number;
    shortfallCents: number;
  }[];
  /** Cumulative positive shortfall across COMPLETED years (baseYear+1 .. currentYear-1). */
  arrearsCents: number;
  /** Forward annual run-rate gap at the current year (correct − billed). */
  upliftCents: number;
}

/**
 * Reconcile a projection against what was billed each year. `billedByYear` maps a
 * contract-year to the annual amount actually billed (flat, when an escalator was
 * never applied). Arrears counts completed anniversary years; uplift is the
 * current-year forward gap. A year missing from `billedByYear` defaults to the
 * base price (i.e. treated as billed flat at base).
 */
export function reconcileCatchUp(
  input: EscalatorProjectionInput,
  billedByYear: Record<number, number>,
  currentYear: number,
): CatchUp {
  const projection = projectEscalator(input);
  const priceAt = (year: number): number => {
    if (year <= input.baseYear) return input.basePriceCents;
    const step = projection.steps.find((s) => s.year === year);
    return step ? step.priceCents : projection.currentPriceCents;
  };

  const perYear: CatchUp["perYear"] = [];
  let arrearsCents = 0;
  for (let year = input.baseYear + 1; year <= currentYear; year++) {
    const correctCents = priceAt(year);
    const billedCents = billedByYear[year] ?? input.basePriceCents;
    const shortfallCents = correctCents - billedCents;
    perYear.push({ year, correctCents, billedCents, shortfallCents });
    if (year < currentYear && shortfallCents > 0) arrearsCents += shortfallCents;
  }

  const current = perYear.find((p) => p.year === currentYear);
  const upliftCents = current ? Math.max(0, current.shortfallCents) : 0;

  return { projection, perYear, arrearsCents, upliftCents };
}

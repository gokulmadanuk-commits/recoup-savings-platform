import { describe, it, expect } from "vitest";
import { toCents, toDollars } from "../money";
import { projectEscalator, reconcileCatchUp } from "./escalator";
import { RPI_SERIES } from "./rpi";
import { RevenueEscalatorSchema, type RevenueEscalator } from "./types";

function esc(input: Parameters<typeof RevenueEscalatorSchema.parse>[0]): RevenueEscalator {
  return RevenueEscalatorSchema.parse(input);
}

const wholeDollars = (cents: number) => Math.round(toDollars(cents));

describe("escalator engine — projection", () => {
  it("reproduces the RPI worked-example table to the whole dollar (base $100k from 2021)", () => {
    const p = projectEscalator({
      basePriceCents: toCents(100_000),
      baseYear: 2021,
      throughYear: 2026,
      escalator: esc({ type: "rpi" }),
    });
    // Correct annual price at each anniversary, per the published RPI (CHAW) Jan prints.
    expect(p.steps.map((s) => wholeDollars(s.priceCents))).toEqual([
      107_841, 122_301, 128_310, 132_960, 137_950,
    ]);
    expect(wholeDollars(p.currentPriceCents)).toBe(137_950);
  });

  it("pure-index path equals the direct base × cumulative-ratio (no rounding drift)", () => {
    const base = toCents(100_000);
    const p = projectEscalator({
      basePriceCents: base,
      baseYear: 2021,
      throughYear: 2026,
      escalator: esc({ type: "rpi" }),
    });
    const direct = Math.round((base * RPI_SERIES[2026]) / RPI_SERIES[2021]);
    expect(p.currentPriceCents).toBe(direct);
  });

  it("fixed compound applies (1+r)^n", () => {
    const p = projectEscalator({
      basePriceCents: toCents(100_000),
      baseYear: 2023,
      throughYear: 2026,
      escalator: esc({ type: "fixed", fixedPct: 0.05 }),
    });
    // 100000 × 1.05^3 = 115762.5 → $115,763 (round-once from base)
    expect(p.steps.map((s) => s.priceCents)).toEqual([
      toCents(105_000),
      toCents(110_250),
      Math.round(toCents(100_000) * 1.05 ** 3),
    ]);
    expect(wholeDollars(p.currentPriceCents)).toBe(115_763);
  });

  it("a collar clamps each anniversary rate (floor 3%, cap 5% on RPI)", () => {
    const p = projectEscalator({
      basePriceCents: toCents(100_000),
      baseYear: 2021,
      throughYear: 2026,
      escalator: esc({ type: "rpi", floorPct: 0.03, capPct: 0.05 }),
    });
    const rates = p.steps.map((s) => Number(s.rate.toFixed(4)));
    // 2022/2023 RPI YoY > 5% → clamped to cap; later years sit inside the collar.
    expect(rates[0]).toBe(0.05);
    expect(rates[1]).toBe(0.05);
    expect(rates[2]).toBeGreaterThan(0.03);
    expect(rates[2]).toBeLessThan(0.05);
    // Every applied rate must sit within [floor, cap].
    for (const r of rates) {
      expect(r).toBeGreaterThanOrEqual(0.03);
      expect(r).toBeLessThanOrEqual(0.05);
    }
  });

  it("type 'none' produces no anniversaries and holds the base price", () => {
    const p = projectEscalator({
      basePriceCents: toCents(50_000),
      baseYear: 2021,
      throughYear: 2026,
      escalator: esc({ type: "none" }),
    });
    expect(p.steps).toHaveLength(0);
    expect(p.currentPriceCents).toBe(toCents(50_000));
  });

  it("greater_of takes the larger of the fixed floor and CPI YoY", () => {
    // A high fixed floor (8%) dominates CPI in every recent year.
    const p = projectEscalator({
      basePriceCents: toCents(100_000),
      baseYear: 2023,
      throughYear: 2025,
      escalator: esc({ type: "greater_of", fixedPct: 0.08 }),
    });
    for (const s of p.steps) expect(s.rate).toBeCloseTo(0.08, 5);
  });
});

describe("escalator engine — catch-up reconciliation", () => {
  it("sums arrears over completed years and a forward uplift for the current year", () => {
    const input = {
      basePriceCents: toCents(100_000),
      baseYear: 2021,
      throughYear: 2026,
      escalator: esc({ type: "rpi" }),
    };
    // Billed flat at $100k every year (escalator never applied).
    const c = reconcileCatchUp(input, {}, 2026);
    // Arrears = Σ (correct − 100k) for 2022..2025 (completed); uplift = 2026 gap.
    expect(wholeDollars(c.arrearsCents)).toBe(91_412);
    expect(wholeDollars(c.upliftCents)).toBe(37_950);
    expect(c.perYear).toHaveLength(5);
    expect(c.perYear.at(-1)!.year).toBe(2026);
  });

  it("a year billed at the correct escalated price contributes no shortfall", () => {
    const input = {
      basePriceCents: toCents(100_000),
      baseYear: 2024,
      throughYear: 2025,
      escalator: esc({ type: "fixed", fixedPct: 0.05 }),
    };
    // 2025 billed correctly at $105k → zero uplift.
    const c = reconcileCatchUp(input, { 2025: toCents(105_000) }, 2025);
    expect(c.upliftCents).toBe(0);
    expect(c.arrearsCents).toBe(0);
  });
});

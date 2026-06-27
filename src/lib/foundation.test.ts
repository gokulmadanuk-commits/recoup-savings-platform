import { describe, it, expect } from "vitest";
import {
  toCents,
  toDollars,
  pctOfCents,
  lineTotalCents,
  annualizeCents,
  sumCents,
  formatUSD,
  formatUSDPrecise,
  formatPct,
} from "./money";
import { addDays, daysBetween, monthsBetween, addMonths, toISO, parse } from "./dates";
import { ANALYSIS_DATE, CONFIG } from "./config";
import { CPI_BENCHMARK } from "./cpi";
import { DatasetSchema, FindingSchema } from "./types";

describe("money (integer cents)", () => {
  it("converts dollars to cents and back without drift", () => {
    expect(toCents(45)).toBe(4500);
    expect(toCents(48.6)).toBe(4860);
    expect(toDollars(4860)).toBe(48.6);
  });

  it("computes the Brightseat overcharge ($48.60 vs $45 on 200 seats x 12mo = $8,640)", () => {
    const overchargePerSeat = toCents(48.6) - toCents(45); // 360 cents
    const annual = overchargePerSeat * 200 * 12;
    expect(annual).toBe(864_000);
    expect(formatUSD(annual)).toBe("$8,640");
  });

  it("annualizes per-period amounts", () => {
    expect(annualizeCents(125_000, "monthly")).toBe(1_500_000);
    expect(annualizeCents(125_000, "quarterly")).toBe(500_000);
    expect(annualizeCents(125_000, "one_time")).toBe(125_000);
  });

  it("pctOfCents and lineTotalCents round to whole cents", () => {
    expect(pctOfCents(100_000, 0.085)).toBe(8_500);
    expect(lineTotalCents(8_500, 1.5)).toBe(12_750);
    expect(sumCents([100, 200, 300])).toBe(600);
  });

  it("formats currency and percentages", () => {
    expect(formatUSDPrecise(4860)).toBe("$48.60");
    expect(formatUSD(864_000)).toBe("$8,640");
    expect(formatPct(0.085)).toBe("8.5%");
  });
});

describe("dates (ISO strings)", () => {
  it("adds days/months and diffs", () => {
    expect(addDays("2026-06-27", 52)).toBe("2026-08-18");
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-28");
    expect(daysBetween("2026-06-27", "2026-08-18")).toBe(52);
    expect(monthsBetween("2026-01-15", "2026-06-15")).toBe(5);
  });

  it("round-trips Date <-> ISO", () => {
    expect(toISO(parse("2026-06-27"))).toBe("2026-06-27");
  });
});

describe("config + cpi", () => {
  it("exposes pinned thresholds", () => {
    expect(ANALYSIS_DATE).toBe("2026-06-27");
    expect(CONFIG.autoRenewalWindowDays).toBe(90);
    expect(CONFIG.feeRateRecovery).toBe(0.3);
    expect(CONFIG.feeRateAvoidance).toBe(0.2);
    expect(CPI_BENCHMARK.pct).toBeCloseTo(0.032);
  });
});

describe("schemas validate a minimal dataset and finding", () => {
  it("parses an empty dataset with defaults", () => {
    const ds = DatasetSchema.parse({
      customer: "Northwind Logistics Group, Inc.",
      analysisDate: ANALYSIS_DATE,
      vendors: [],
    });
    expect(ds.vendors).toEqual([]);
  });

  it("parses a finding and applies defaults", () => {
    const f = FindingSchema.parse({
      id: "F1",
      ruleId: "R02",
      ruleName: "Invoice Rate Mismatch",
      category: "rate_mismatch",
      vendorId: "brightseat",
      vendorName: "Brightseat CRM",
      title: "Billed above contracted seat rate",
      summary: "Invoiced $48.60/seat vs $45.00 contracted on 200 seats.",
      savingsType: "recovery",
      annualizedSavingsCents: 864_000,
      feeRate: 0.3,
      estimatedFeeCents: 259_200,
      confidence: 0.95,
      leverage: "Documented repeated overcharge on the same SKU.",
    });
    expect(f.recoverableToDateCents).toBe(0);
    expect(f.severity).toBe("medium");
    expect(f.evidence).toEqual([]);
  });
});

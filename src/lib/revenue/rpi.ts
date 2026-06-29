/**
 * Inflation-index benchmarks used by the escalator engine (./escalator) and RL01.
 * Like ../cpi, these are pinned, version-stamped annual anchors so analysis is
 * deterministic and offline; the value used is recorded on every escalator
 * finding for audit. Two series are provided:
 *
 *   CPI_U_SERIES  — US CPI-U (all items, NSA), annual January anchors.
 *   RPI_SERIES    — UK RPI (series CHAW, Jan 1987 = 100), annual January anchors.
 *
 * In production these pull from BLS / ONS; here the values are realistic
 * trailing figures (RPI matches the published Jan prints used in the RL01 worked
 * example). Escalators reference a series by year; the engine takes the ratio of
 * the anniversary year's anchor to the base year's anchor.
 */

export type IndexSeries = Record<number, number>;

/** US CPI-U, all items, not seasonally adjusted — annual January anchors. */
export const CPI_U_SERIES: IndexSeries = {
  2018: 247.867,
  2019: 251.712,
  2020: 257.971,
  2021: 261.582,
  2022: 281.148,
  2023: 299.170,
  2024: 308.417,
  2025: 317.671,
  2026: 326.500,
};

/** UK RPI (CHAW, Jan 1987 = 100) — annual January anchors. */
export const RPI_SERIES: IndexSeries = {
  2018: 276.0,
  2019: 283.0,
  2020: 290.6,
  2021: 294.6,
  2022: 317.7,
  2023: 360.3,
  2024: 378.0,
  2025: 391.7,
  2026: 406.4,
};

export const INDEX_BENCHMARK = {
  cpi: {
    series: "CPI-U (US city average, all items, NSA)",
    source: "BLS",
    asOf: "2026-01",
    /** Trailing-12-month CPI-U as a fraction (Jan 2026 vs Jan 2025). */
    pct: CPI_U_SERIES[2026] / CPI_U_SERIES[2025] - 1,
  },
  rpi: {
    series: "RPI (UK, series CHAW, Jan 1987 = 100)",
    source: "ONS",
    asOf: "2026-01",
    /** Trailing-12-month RPI as a fraction (Jan 2026 vs Jan 2025). */
    pct: RPI_SERIES[2026] / RPI_SERIES[2025] - 1,
  },
} as const;

/** The series an escalator type indexes against (null for fixed/none). */
export function seriesFor(type: string): IndexSeries | null {
  if (type === "cpi" || type === "cpi_plus") return CPI_U_SERIES;
  if (type === "rpi" || type === "rpi_plus") return RPI_SERIES;
  return null;
}

/**
 * Index value for a year, clamped to the available range so a base/anniversary
 * just outside the table still resolves to the nearest known anchor.
 */
export function indexValue(series: IndexSeries, year: number): number {
  if (series[year] !== undefined) return series[year];
  const years = Object.keys(series)
    .map(Number)
    .sort((a, b) => a - b);
  if (year < years[0]) return series[years[0]];
  return series[years[years.length - 1]];
}

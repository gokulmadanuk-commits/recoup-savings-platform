/**
 * CPI benchmark used by R04 (price-escalator challenge). In production this
 * pulls the BLS CPI-U series and stores the exact value used with each finding;
 * here we pin a realistic trailing-12-month figure so analysis is deterministic
 * and offline. The value used is recorded on every escalator finding for audit.
 */
export const CPI_BENCHMARK = {
  /** Trailing-12-month CPI-U as a fraction (3.2%). */
  pct: 0.032,
  series: "CPI-U (US city average, all items)",
  source: "BLS",
  asOf: "2026-05",
  label: "BLS CPI-U trailing 12mo (May 2026): 3.2%",
} as const;

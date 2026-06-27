/**
 * Every threshold the detection rules use is a named, version-pinned config
 * value, so findings are reproducible and auditable. Change a number here and
 * the whole engine re-reckons consistently.
 */
import type { ISODate } from "./dates";

/**
 * The anchor "today" for date-sensitive rules (auto-renewal windows, missed
 * early-pay). Pinned so the demo and tests are fully reproducible — the seed
 * corpus is generated relative to this same date.
 */
export const ANALYSIS_DATE: ISODate = "2026-06-27";

export const RULES_VERSION = "1.0.0";

export const CONFIG = {
  /** R01 — flag contracts auto-renewing within this many days. */
  autoRenewalWindowDays: 90,
  /** R01 — notice deadline within this many days is "urgent". */
  noticeUrgentDays: 14,

  /** R02 — overcharge tolerance: max(min cents, pct of expected). */
  rateTolerancePct: 0.005,
  rateToleranceMinCents: 1,

  /** R03 — a seat/line inactive for longer than this is "idle" (default lens). */
  inactiveDaysDefault: 30,
  inactiveDaysConservative: 90,
  /** R03 — sanity ceiling per idle seat per year ($1,785). */
  idleSeatAnnualSanityCents: 178_500,

  /** R04 — any fixed YoY escalator above this is "above market". */
  escalatorAboveMarketPct: 0.08,
  /** R04 — fair margin added to CPI when judging CPI-gap. */
  fairMarginPct: 0.04,

  /** R06 — duplicate fuzzy-match thresholds. */
  dupAmountTolPct: 0.005,
  dupDateDays: 7,
  /** R02/R06/R07 — shared fuzzy line-matcher cutoff. */
  fuzzyMatchThreshold: 0.85,

  /** R09 — flag minimum-commitment utilization below this hard. */
  minCommitUtilizationFlag: 0.8,
  /** R09 — buffer added when recommending a right-sized commitment. */
  rightSizeBufferPct: 0.1,

  /** R11 — months of zero usage before a service line is "zombie". */
  zombieZeroUsageMonths: 3,

  /** Findings below this confidence route to human review (not auto-asserted). */
  confidenceReviewThreshold: 0.6,

  /** Contingency fee rates. */
  feeRateRecovery: 0.3,
  feeRateAvoidance: 0.2,
} as const;

export type AppConfig = typeof CONFIG;

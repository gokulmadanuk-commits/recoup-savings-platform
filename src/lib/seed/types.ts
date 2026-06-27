import type { VendorRecord } from "../types";

/**
 * The answer key. Each expected finding is authored from the documented planted
 * value, independent of both the seed arithmetic and the rule engine, so the
 * rule tests genuinely verify parser + rule reproduce a known number.
 */
export interface ExpectedFinding {
  vendorId: string;
  ruleId: string; // "R02"
  category: string;
  savingsType: "recovery" | "avoidance";
  /** Exact expected annualized savings in cents. */
  annualizedSavingsCents: number;
  recoverableToDateCents?: number;
  /** Allowed deviation when the value isn't perfectly deterministic (default 0). */
  tolerancePct?: number;
  note: string;
}

export interface VendorSeed {
  record: VendorRecord;
  expected: ExpectedFinding[];
}

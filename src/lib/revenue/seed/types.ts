import type { CustomerRecord } from "../types";

/**
 * The revenue answer key. Each expected finding is authored from the documented
 * planted value (computed via the escalator engine for RL01) independent of the
 * rule wiring, so the integration test genuinely verifies the engine reproduces
 * a known number with zero false positives.
 */
export interface ExpectedRevenueFinding {
  customerId: string;
  ruleId: string; // "RL01"
  category: string;
  recoveryType: "arrears" | "uplift";
  arrearsToDateCents: number;
  annualizedUpliftCents: number;
  totalRecoverableCents: number;
  relationshipRisk: "A" | "B" | "C";
  /** Allowed deviation when a value isn't perfectly deterministic (default 0). */
  tolerancePct?: number;
  note: string;
}

export interface CustomerSeed {
  record: CustomerRecord;
  expected: ExpectedRevenueFinding[];
}

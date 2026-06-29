/**
 * Relationship-risk grading — the discipline that separates this from naive
 * back-billing. Every revenue finding is scored on four axes (each 0..1) and
 * graded A/B/C, which maps to a recommended action:
 *
 *   A → retroactive_claim   back-bill now; invoke the audit / true-up clause
 *   B → negotiate_partial   correct forward + negotiate partial arrears
 *   C → forward_only        silent forward correction; price-increase notice only
 *
 * Axes (higher = safer to claim):
 *   entitlement     strength of the contractual right to the money
 *   auditWindow     share of the arrears that sits within the audit window / statute
 *   waiverEstoppel  inverse waiver/estoppel risk (1 = recent/short; 0 = knowingly
 *                   under-billed for years, customer relied)
 *   relationship    inverse churn risk (1 = low-stakes/exiting; 0 = strategic high-LTV)
 *
 * Two hard gates encode the research: a finding can only be grade A with a strong
 * entitlement AND low waiver/estoppel risk AND most arrears inside the window — a
 * clean clause still drops to B/C if you knowingly under-billed for years.
 */
import type { RiskFactors, RecommendedActionT, RelationshipRiskGradeT } from "../types";

export interface RiskAxes {
  entitlement: number;
  auditWindow: number;
  waiverEstoppel: number;
  relationship: number;
}

export interface RiskGrade {
  grade: RelationshipRiskGradeT;
  action: RecommendedActionT;
  factors: RiskFactors;
  /** Blended 0..4 score, for transparency/sorting. */
  score: number;
}

const ACTION_FOR: Record<RelationshipRiskGradeT, RecommendedActionT> = {
  A: "retroactive_claim",
  B: "negotiate_partial",
  C: "forward_only",
};

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

export function gradeRelationshipRisk(axes: RiskAxes): RiskGrade {
  const entitlement = clamp01(axes.entitlement);
  const auditWindow = clamp01(axes.auditWindow);
  const waiverEstoppel = clamp01(axes.waiverEstoppel);
  const relationship = clamp01(axes.relationship);
  const score = entitlement + auditWindow + waiverEstoppel + relationship;

  // Grade-A gates: strong right, mostly in-window, low waiver risk.
  const canClaim =
    entitlement >= 0.66 && waiverEstoppel >= 0.5 && auditWindow >= 0.5;
  // Grade-C triggers: weak right, mostly time-barred, or high churn risk.
  const forwardOnly =
    entitlement < 0.4 || auditWindow < 0.34 || relationship < 0.25;

  // The forward-only safety gate (weak right, time-barred, or high churn risk)
  // takes precedence over a claim — a strategic account is corrected forward even
  // when the entitlement is otherwise airtight.
  let grade: RelationshipRiskGradeT;
  if (forwardOnly || score < 1.7) grade = "C";
  else if (canClaim && score >= 3.0) grade = "A";
  else grade = "B";

  return {
    grade,
    action: ACTION_FOR[grade],
    factors: { entitlement, auditWindow, waiverEstoppel, relationship },
    score,
  };
}

/**
 * Convenience: derive the auditWindow axis from how much of the arrears period
 * falls inside the contractual audit window. `monthsElapsed` = months of
 * under-billing; `auditWindowMonths` = the contract's lookback right.
 */
export function auditWindowAxis(
  monthsElapsed: number,
  auditWindowMonths: number,
): number {
  if (monthsElapsed <= 0) return 1;
  return clamp01(Math.min(monthsElapsed, auditWindowMonths) / monthsElapsed);
}

/**
 * Convenience: waiver/estoppel risk decays the longer you silently under-billed.
 * Recent (≤12mo) ≈ clean; multi-year knowing under-billing ≈ risky.
 */
export function waiverEstoppelAxis(monthsElapsed: number): number {
  if (monthsElapsed <= 12) return 1;
  if (monthsElapsed >= 60) return 0.2;
  // Linear decay from 1.0 at 12mo to 0.2 at 60mo.
  return clamp01(1 - ((monthsElapsed - 12) / 48) * 0.8);
}

/**
 * The revenue-rule-engine contract — the seller-side parallel of ../../rules/types.
 * Every detection rule implements `RevenueRule` and emits `RevenueFinding`s via
 * `makeRevenueFinding`, which computes the BLENDED contingency fee and grades
 * relationship risk. Most rules are per-customer.
 *
 * Fee model (the one intended divergence from the cost-side makeFinding's single
 * rate): a finding carries BOTH back-billable arrears (recovery, 30%) and forward
 * run-rate uplift (avoidance, 20%), so the fee is the sum of the two legs and
 * `feeRate` is the resulting blended effective rate.
 */
import {
  RevenueFindingSchema,
  type RevenueFinding,
  type RevenueFindingCategoryT,
  type RevenueDataset,
  type CustomerRecord,
} from "../types";
import type { Evidence } from "../../types";
import { CONFIG, type AppConfig } from "../../config";
import { INDEX_BENCHMARK } from "../rpi";
import type { ISODate } from "../../dates";
import { gradeRelationshipRisk, type RiskAxes } from "./risk";

export interface RevenueRuleContext {
  dataset: RevenueDataset;
  analysisDate: ISODate;
  config: AppConfig;
  cpi: typeof INDEX_BENCHMARK.cpi;
  rpi: typeof INDEX_BENCHMARK.rpi;
}

export interface RevenueRule {
  id: string; // "RL01"
  name: string;
  category: RevenueFindingCategoryT;
  /** Produce findings across the dataset. Must never throw past the runner. */
  run(ctx: RevenueRuleContext): RevenueFinding[];
}

export function makeRevenueContext(dataset: RevenueDataset): RevenueRuleContext {
  return {
    dataset,
    analysisDate: dataset.analysisDate,
    config: CONFIG,
    cpi: INDEX_BENCHMARK.cpi,
    rpi: INDEX_BENCHMARK.rpi,
  };
}

export interface RevenueFindingInput {
  ruleId: string;
  ruleName: string;
  category: RevenueFindingCategoryT;
  customerId: string;
  customerName: string;
  title: string;
  summary: string;
  /** Back-billable arrears to date (recovery — 30%). */
  arrearsToDateCents?: number;
  /** Forward annualised run-rate uplift (avoidance — 20%). */
  annualizedUpliftCents?: number;
  confidence: number;
  severity?: RevenueFinding["severity"];
  leverage: string;
  evidence?: Evidence[];
  recommendedAsk?: string | null;
  clauseCited?: string | null;
  deadlineDate?: ISODate | null;
  /** The four relationship-risk axes (0..1) → grade A/B/C + action. */
  risk: RiskAxes;
  /** Override the default id (`${ruleId}-${customerId}`). */
  id?: string;
}

/**
 * Build a validated RevenueFinding: blended fee from the two legs, relationship
 * grade from the risk axes, ranking key = arrears + uplift.
 */
export function makeRevenueFinding(input: RevenueFindingInput): RevenueFinding {
  const arrears = input.arrearsToDateCents ?? 0;
  const uplift = input.annualizedUpliftCents ?? 0;
  const total = arrears + uplift;

  const estimatedFeeCents =
    Math.round(arrears * CONFIG.feeRateRecovery) +
    Math.round(uplift * CONFIG.feeRateAvoidance);
  const feeRate = total > 0 ? estimatedFeeCents / total : 0;

  const risk = gradeRelationshipRisk(input.risk);

  return RevenueFindingSchema.parse({
    id: input.id ?? `${input.ruleId}-${input.customerId}`,
    ruleId: input.ruleId,
    ruleName: input.ruleName,
    category: input.category,
    customerId: input.customerId,
    customerName: input.customerName,
    title: input.title,
    summary: input.summary,
    recoveryType: arrears >= uplift ? "arrears" : "uplift",
    arrearsToDateCents: arrears,
    annualizedUpliftCents: uplift,
    totalRecoverableCents: total,
    feeRate,
    estimatedFeeCents,
    relationshipRisk: risk.grade,
    recommendedAction: risk.action,
    riskFactors: risk.factors,
    confidence: input.confidence,
    severity: input.severity ?? "medium",
    leverage: input.leverage,
    evidence: input.evidence ?? [],
    recommendedAsk: input.recommendedAsk ?? null,
    clauseCited: input.clauseCited ?? null,
    deadlineDate: input.deadlineDate ?? null,
  });
}

/** Helper for the common case: a rule that examines each customer independently. */
export function perCustomerRule(
  id: string,
  name: string,
  category: RevenueFindingCategoryT,
  fn: (customer: CustomerRecord, ctx: RevenueRuleContext) => RevenueFinding[],
): RevenueRule {
  return {
    id,
    name,
    category,
    run(ctx) {
      return ctx.dataset.customers.flatMap((c) => {
        try {
          return fn(c, ctx);
        } catch {
          // A bad single customer must not abort the rule.
          return [];
        }
      });
    },
  };
}

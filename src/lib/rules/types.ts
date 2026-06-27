/**
 * The rule-engine contract. Every detection rule implements `Rule` and emits
 * `Finding`s via `makeFinding` (which computes the contingency fee and applies
 * defaults). Most rules are per-vendor; cross-vendor rules (R13) read the whole
 * dataset.
 */
import {
  FindingSchema,
  type Finding,
  type FindingCategoryT,
  type SavingsTypeT,
  type Dataset,
  type VendorRecord,
  type Evidence,
} from "../types";
import { CONFIG, type AppConfig } from "../config";
import { CPI_BENCHMARK } from "../cpi";
import type { ISODate } from "../dates";

export interface RuleContext {
  dataset: Dataset;
  analysisDate: ISODate;
  config: AppConfig;
  cpi: typeof CPI_BENCHMARK;
}

export interface Rule {
  id: string; // "R01"
  name: string;
  category: FindingCategoryT;
  /** Produce findings across the dataset. Must never throw past the runner. */
  run(ctx: RuleContext): Finding[];
}

export function makeContext(dataset: Dataset): RuleContext {
  return {
    dataset,
    analysisDate: dataset.analysisDate,
    config: CONFIG,
    cpi: CPI_BENCHMARK,
  };
}

export interface FindingInput {
  ruleId: string;
  ruleName: string;
  category: FindingCategoryT;
  vendorId: string;
  vendorName: string;
  title: string;
  summary: string;
  savingsType: SavingsTypeT;
  annualizedSavingsCents: number;
  recoverableToDateCents?: number;
  atRiskCents?: number;
  confidence: number;
  severity?: Finding["severity"];
  leverage: string;
  evidence?: Evidence[];
  recommendedAsk?: string | null;
  deadlineDate?: ISODate | null;
  /** Override the default id (`${ruleId}-${vendorId}`) when a rule emits several per vendor. */
  id?: string;
}

/** Build a validated Finding, computing the contingency fee from the savings type. */
export function makeFinding(input: FindingInput): Finding {
  const feeRate =
    input.savingsType === "recovery"
      ? CONFIG.feeRateRecovery
      : CONFIG.feeRateAvoidance;
  const estimatedFeeCents = Math.round(input.annualizedSavingsCents * feeRate);
  return FindingSchema.parse({
    id: input.id ?? `${input.ruleId}-${input.vendorId}`,
    ruleId: input.ruleId,
    ruleName: input.ruleName,
    category: input.category,
    vendorId: input.vendorId,
    vendorName: input.vendorName,
    title: input.title,
    summary: input.summary,
    savingsType: input.savingsType,
    annualizedSavingsCents: input.annualizedSavingsCents,
    recoverableToDateCents: input.recoverableToDateCents ?? 0,
    atRiskCents: input.atRiskCents ?? 0,
    feeRate,
    estimatedFeeCents,
    confidence: input.confidence,
    severity: input.severity ?? "medium",
    leverage: input.leverage,
    evidence: input.evidence ?? [],
    recommendedAsk: input.recommendedAsk ?? null,
    deadlineDate: input.deadlineDate ?? null,
  });
}

/** Helper for the common case: a rule that examines each vendor independently. */
export function perVendorRule(
  id: string,
  name: string,
  category: FindingCategoryT,
  fn: (vendor: VendorRecord, ctx: RuleContext) => Finding[],
): Rule {
  return {
    id,
    name,
    category,
    run(ctx) {
      return ctx.dataset.vendors.flatMap((v) => {
        try {
          return fn(v, ctx);
        } catch {
          // A bad single vendor must not abort the rule.
          return [];
        }
      });
    },
  };
}

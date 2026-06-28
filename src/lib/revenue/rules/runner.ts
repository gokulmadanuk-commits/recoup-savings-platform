/**
 * Runs the revenue rule set over a dataset and returns findings ranked by total
 * recoverable. Mirror of ../../rules/runner. Each rule is isolated: a throwing
 * rule yields no findings rather than aborting the batch.
 */
import type { RevenueFinding } from "../types";
import { rankRevenueFindings } from "./rank";
import { makeRevenueContext, type RevenueRule } from "./types";
import type { RevenueDataset } from "../types";

export function runRevenueRules(
  rules: RevenueRule[],
  dataset: RevenueDataset,
): RevenueFinding[] {
  const ctx = makeRevenueContext(dataset);
  const findings: RevenueFinding[] = [];
  for (const rule of rules) {
    try {
      findings.push(...rule.run(ctx));
    } catch {
      // A bad rule must never abort the run.
    }
  }
  return rankRevenueFindings(findings);
}

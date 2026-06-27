/**
 * Runs a set of rules over a dataset and returns ranked findings. A rule that
 * throws is skipped — one broken rule must never abort the whole analysis.
 */
import { rankFindings } from "./rank";
import type { Rule, RuleContext } from "./types";
import type { Finding } from "../types";

export function runRules(rules: Rule[], ctx: RuleContext): Finding[] {
  const out: Finding[] = [];
  for (const rule of rules) {
    try {
      out.push(...rule.run(ctx));
    } catch {
      // swallow — resilience over completeness for a single misbehaving rule
    }
  }
  return rankFindings(out);
}

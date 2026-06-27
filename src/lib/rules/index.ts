/**
 * The detection-rule registry. ALL_RULES is the single source of truth for the
 * analysis engine; the analyze pipeline runs exactly these.
 */
import type { Rule } from "./types";

import r01 from "./r01-auto-renewal";
import r02 from "./r02-rate-mismatch";
import r03 from "./r03-unused-seats";
import r04 from "./r04-escalator";
import r05 from "./r05-overage";
import r06 from "./r06-duplicate";
import r07 from "./r07-volume-discount";
import r08 from "./r08-early-pay";
import r09 from "./r09-minimum-commit";
import r10 from "./r10-tier-downgrade";
import r11 from "./r11-zombie-line";
import r12 from "./r12-overbilling";
import r13 from "./r13-redundancy";
import r14 from "./r14-headcount-fee";

export const ALL_RULES: Rule[] = [
  r01, r02, r03, r04, r05, r06, r07, r08, r09, r10, r11, r12, r13, r14,
];

export { runRules } from "./runner";
export { rankFindings, summarize, totalAnnualSpendCents } from "./rank";
export { makeContext } from "./types";
export type { Rule, RuleContext } from "./types";

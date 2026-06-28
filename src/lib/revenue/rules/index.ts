/**
 * The revenue rule registry. Mirror of ../../rules/index. Rules are run in order
 * and findings ranked by total recoverable (see runner + rank).
 */
import type { RevenueRule } from "./types";
import { rl01 } from "./rl01-escalator-missed";
import { rl02 } from "./rl02-price-step-missed";
import { rl03 } from "./rl03-expired-discount";
import { rl04 } from "./rl04-tier-breach";
import { rl05 } from "./rl05-unbilled-overage";
import { rl06 } from "./rl06-min-commit-shortfall";
import { rl07 } from "./rl07-missing-surcharge";
import { rl08 } from "./rl08-unbilled-services";
import { rl09 } from "./rl09-renewal-repricing";
import { rl10 } from "./rl10-late-interest";
import { rl11 } from "./rl11-rebate-over-credit";

export const ALL_REVENUE_RULES: RevenueRule[] = [
  rl01,
  rl02,
  rl03,
  rl04,
  rl05,
  rl06,
  rl07,
  rl08,
  rl09,
  rl10,
  rl11,
];

export { runRevenueRules } from "./runner";

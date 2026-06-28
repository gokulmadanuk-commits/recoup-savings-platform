/**
 * The revenue synthetic corpus registry. Northwind Logistics Group as the SELLER:
 * 11 customers carrying one planted finding each (RL01–RL11) + 8 clean customers
 * that exercise the collections queue without tripping any rule. REVENUE_EXPECTED
 * is the answer key the integration test asserts the engine reproduces exactly.
 */
import { RevenueDatasetSchema, SELLER_NAME, type RevenueDataset } from "../types";
import { ANALYSIS_DATE } from "../../config";
import type { CustomerSeed, ExpectedRevenueFinding } from "./types";

// Rule-bearing customers (one planted finding each).
import cohort from "./customers/cohort-retail-distribution"; // RL01
import harborline from "./customers/harborline-grocery-distribution"; // RL02
import brightline from "./customers/brightline-grocers"; // RL03
import tidewater from "./customers/tidewater-wholesale-supply"; // RL04
import granitePeak from "./customers/granite-peak-manufacturing"; // RL05
import lakeshore from "./customers/lakeshore-foods-coop"; // RL06
import continental from "./customers/continental-auto-parts"; // RL07
import cedarbrook from "./customers/cedarbrook-logistics"; // RL08
import northgate from "./customers/northgate-distribution-centers"; // RL09
import pinnacle from "./customers/pinnacle-retail-group"; // RL10
import evergreen from "./customers/evergreen-wholesale-foods"; // RL11

// Clean / AR-heavy customers (no findings; power the collections queue).
import meadowbrook from "./customers/meadowbrook-foods";
import atlantic from "./customers/atlantic-cold-chain";
import summit from "./customers/summit-ecommerce-fulfilment";
import redwood from "./customers/redwood-building-supply";
import keystone from "./customers/keystone-pharma-logistics";
import blueRidge from "./customers/blue-ridge-courier";
import copperfield from "./customers/copperfield-apparel";
import sierra from "./customers/sierra-beverage-distribution";

export const CUSTOMER_SEEDS: CustomerSeed[] = [
  cohort,
  harborline,
  brightline,
  tidewater,
  granitePeak,
  lakeshore,
  continental,
  cedarbrook,
  northgate,
  pinnacle,
  evergreen,
  meadowbrook,
  atlantic,
  summit,
  redwood,
  keystone,
  blueRidge,
  copperfield,
  sierra,
];

export function revenueSeedDataset(): RevenueDataset {
  return RevenueDatasetSchema.parse({
    seller: SELLER_NAME,
    analysisDate: ANALYSIS_DATE,
    customers: CUSTOMER_SEEDS.map((s) => s.record),
  });
}

/** The answer key (flattened across all customers). */
export const REVENUE_EXPECTED: ExpectedRevenueFinding[] = CUSTOMER_SEEDS.flatMap(
  (s) => s.expected,
);

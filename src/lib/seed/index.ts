/**
 * The seed corpus registry. Each vendor module exports a VendorSeed (its
 * VendorRecord + its slice of the answer key). Add a vendor by importing its
 * module and listing it in SEEDS.
 */
import { DatasetSchema, type Dataset } from "../types";
import { ANALYSIS_DATE } from "../config";
import { COMPANY } from "./helpers";
import type { VendorSeed, ExpectedFinding } from "./types";

import brightseat from "./vendors/brightseat";
import collabhub from "./vendors/collabhub";

export const SEEDS: VendorSeed[] = [brightseat, collabhub];

/** The full synthetic dataset (validated). */
export function seedDataset(): Dataset {
  return DatasetSchema.parse({
    customer: COMPANY.name,
    analysisDate: ANALYSIS_DATE,
    vendors: SEEDS.map((s) => s.record),
  });
}

/** The complete answer key across all seeded vendors. */
export const EXPECTED: ExpectedFinding[] = SEEDS.flatMap((s) => s.expected);

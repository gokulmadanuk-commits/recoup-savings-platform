/**
 * The seed corpus registry. Each vendor module exports a VendorSeed (its
 * VendorRecord + its slice of the answer key). Add a vendor by importing its
 * module and listing it in SEEDS.
 */
import { DatasetSchema, type Dataset } from "../types";
import { ANALYSIS_DATE } from "../config";
import { COMPANY } from "./helpers";
import type { VendorSeed, ExpectedFinding } from "./types";

import atlascloud from "./vendors/atlascloud";
import brightseat from "./vendors/brightseat";
import cascade from "./vendors/cascade";
import catalyst from "./vendors/catalyst-creative-agency";
import clearwave from "./vendors/clearwave";
import collabhub from "./vendors/collabhub";
import deskflow from "./vendors/deskflow";
import greenscape from "./vendors/greenscape";
import harbor from "./vendors/harbor-benefits-brokers";
import ironroad from "./vendors/ironroad";
import keystone from "./vendors/keystone-mutual-insurance";
import meridian from "./vendors/meridian";
import nimbusedge from "./vendors/nimbusedge";
import payworks from "./vendors/payworks";
import peakrank from "./vendors/peakrank-digital";
import pristinecare from "./vendors/pristinecare";
import redshield from "./vendors/redshield";
import sentryone from "./vendors/sentryone";
import summit from "./vendors/summit-copier";
import swiftparcel from "./vendors/swiftparcel";
import vaultsign from "./vendors/vaultsign";
import vertex from "./vendors/vertex-advisory";

export const SEEDS: VendorSeed[] = [
  brightseat,
  collabhub,
  deskflow,
  vaultsign,
  atlascloud,
  nimbusedge,
  meridian,
  clearwave,
  cascade,
  swiftparcel,
  pristinecare,
  greenscape,
  sentryone,
  ironroad,
  keystone,
  harbor,
  catalyst,
  peakrank,
  redshield,
  summit,
  vertex,
  payworks,
];

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

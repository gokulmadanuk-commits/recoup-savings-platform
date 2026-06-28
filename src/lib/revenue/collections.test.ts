import { describe, it, expect } from "vitest";
import { toCents } from "../money";
import {
  baseCollectability,
  bucketOf,
  pCollect,
  scoreCollections,
  summarizeARAging,
} from "./collections";
import { RevenueDatasetSchema, type RevenueDataset } from "./types";

describe("collectability curve", () => {
  it("anchors to the CCAA delinquency data", () => {
    expect(baseCollectability(0)).toBeCloseTo(0.98, 5);
    expect(baseCollectability(30)).toBeCloseTo(0.899, 5);
    expect(baseCollectability(365)).toBeCloseTo(0.214, 5);
  });
  it("interpolates linearly between anchors and floors past 730 days", () => {
    expect(baseCollectability(60)).toBeCloseTo(0.794, 3); // midway 30↔90
    expect(baseCollectability(900)).toBeCloseTo(0.089, 5);
  });
  it("buckets by days past due", () => {
    expect(bucketOf(0)).toBe("current");
    expect(bucketOf(15)).toBe("1_30");
    expect(bucketOf(45)).toBe("31_60");
    expect(bucketOf(75)).toBe("61_90");
    expect(bucketOf(120)).toBe("90_plus");
  });
});

describe("pCollect signal multipliers", () => {
  const base = {
    promiseToPayDate: null,
    promiseBroken: false,
    partialPayment: false,
    priorWriteOffs: 0,
    disputed: false,
  };
  it("a current, clean balance is near-certain", () => {
    expect(pCollect({ ...base, ageDays: 0 })).toBeCloseTo(0.98, 5);
  });
  it("a dispute roughly halves probability", () => {
    expect(pCollect({ ...base, ageDays: 0, disputed: true })).toBeCloseTo(
      0.98 * 0.6,
      5,
    );
  });
  it("a broken promise-to-pay cuts it hard and clamps to the floor", () => {
    const p = pCollect({
      ...base,
      ageDays: 400,
      promiseBroken: true,
      priorWriteOffs: 2,
    });
    expect(p).toBeGreaterThanOrEqual(0.02);
    expect(p).toBeLessThan(0.12);
  });
});

function dataset(): RevenueDataset {
  return RevenueDatasetSchema.parse({
    seller: "Northwind Logistics Group, Inc.",
    analysisDate: "2026-06-27",
    customers: [
      {
        customer: { id: "a", name: "Alpha Co", segment: "3PL" },
        billings: [
          {
            id: "B1",
            customerId: "a",
            customerName: "Alpha Co",
            sourceDoc: "b1",
            billingNumber: "NW-1",
            invoiceDate: "2026-05-01",
            lines: [],
            subtotalCents: toCents(120_000),
            totalCents: toCents(120_000),
          },
        ],
        arAging: [
          {
            customerId: "a",
            invoiceNumber: "NW-1",
            invoiceDate: "2026-05-01",
            dueDate: "2026-05-31",
            balanceCents: toCents(100_000),
            ageDays: 10,
            bucket: "1_30",
          },
        ],
      },
      {
        customer: { id: "b", name: "Beta Co", segment: "Warehousing" },
        arAging: [
          {
            customerId: "b",
            invoiceNumber: "NW-2",
            invoiceDate: "2025-12-01",
            dueDate: "2025-12-31",
            balanceCents: toCents(200_000),
            ageDays: 180,
            bucket: "90_plus",
            disputed: true,
          },
        ],
      },
    ],
  });
}

describe("scoreCollections", () => {
  it("ranks by ERV (balance × P), not by age or balance alone", () => {
    const scores = scoreCollections(dataset());
    expect(scores).toHaveLength(2);
    // Beta is older AND bigger, but disputed + 180d → lower ERV than Alpha's fresh $100k.
    expect(scores[0].customerId).toBe("a");
    expect(scores[0].ervCents).toBeGreaterThan(scores[1].ervCents);
    expect(scores[0].ervCents).toBe(
      Math.round(scores[0].balanceCents * scores[0].pCollect),
    );
  });
});

describe("summarizeARAging", () => {
  it("rolls up buckets, total open, and DSO", () => {
    const s = summarizeARAging(dataset());
    expect(s.totalOpenCents).toBe(toCents(300_000));
    const bucket = (b: string) => s.buckets.find((x) => x.bucket === b)!;
    expect(bucket("1_30").balanceCents).toBe(toCents(100_000));
    expect(bucket("90_plus").balanceCents).toBe(toCents(200_000));
    // DSO = 300k / 120k billed × 365.
    expect(s.dso).toBeCloseTo((300_000 / 120_000) * 365, 0);
  });
});

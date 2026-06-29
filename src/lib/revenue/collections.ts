/**
 * Collections prioritization — ranks open AR by Expected Recoverable Value
 * (ERV = balance × P(collect)) so the team works the most recoverable first,
 * not merely the oldest. P(collect) is an age-based collectability curve
 * (anchored to the Commercial Collection Agencies of America delinquency data:
 * ~90% at 1 month, ~51% at 6 months, ~21% at 12 months) modified by account
 * signals (disputes, broken promises, prior write-offs, recent partials).
 *
 * The curve is pinned locally (not in the shared CONFIG) so the cost-side engine
 * is entirely unaffected. `1 − P(collect)` doubles as a bad-debt reserve.
 */
import type {
  RevenueDataset,
  CollectionScore,
  ARBucketT,
  ARAgingSummary,
  ARBucketSummary,
} from "./types";

/** CCAA collectability-by-age anchors: [days past due, probability]. */
const CURVE: [number, number][] = [
  [0, 0.98],
  [30, 0.899],
  [90, 0.689],
  [180, 0.513],
  [270, 0.375],
  [365, 0.214],
  [540, 0.152],
  [730, 0.089],
];

/** Linear-interpolated base collectability for a given days-past-due. */
export function baseCollectability(ageDays: number): number {
  if (ageDays <= CURVE[0][0]) return CURVE[0][1];
  const last = CURVE[CURVE.length - 1];
  if (ageDays >= last[0]) return last[1];
  for (let i = 1; i < CURVE.length; i++) {
    const [d1, p1] = CURVE[i];
    if (ageDays <= d1) {
      const [d0, p0] = CURVE[i - 1];
      const t = (ageDays - d0) / (d1 - d0);
      return p0 + t * (p1 - p0);
    }
  }
  return last[1];
}

export function bucketOf(ageDays: number): ARBucketT {
  if (ageDays <= 0) return "current";
  if (ageDays <= 30) return "1_30";
  if (ageDays <= 60) return "31_60";
  if (ageDays <= 90) return "61_90";
  return "90_plus";
}

const BUCKET_LABEL: Record<ARBucketT, string> = {
  current: "Current",
  "1_30": "1–30 days",
  "31_60": "31–60 days",
  "61_90": "61–90 days",
  "90_plus": "90+ days",
};

export interface CollectionSignals {
  ageDays: number;
  disputed: boolean;
  promiseToPayDate: string | null;
  promiseBroken: boolean;
  partialPayment: boolean;
  priorWriteOffs: number;
}

/** Probability of successful collection, 0.02..0.99. */
export function pCollect(s: CollectionSignals): number {
  let p = baseCollectability(s.ageDays);
  if (s.disputed) p *= 0.6;
  if (s.promiseBroken) p *= 0.5;
  else if (s.promiseToPayDate) p *= 1.1; // a live, unbroken promise to pay
  if (s.partialPayment) p *= 1.1;
  if (s.priorWriteOffs > 0) p *= 0.8;
  return Math.max(0.02, Math.min(0.99, p));
}

function recommendedAction(s: CollectionSignals): string {
  if (s.disputed) return "Resolve dispute before pursuing";
  if (s.promiseBroken) return "Escalate — broken promise to pay";
  if (s.ageDays > 90) return "Final demand / agency referral";
  if (s.promiseToPayDate) return "Hold to promise date";
  if (s.ageDays <= 30) return "Standard reminder";
  return "Active follow-up call";
}

/** Score and rank every open AR item by ERV (descending). */
export function scoreCollections(dataset: RevenueDataset): CollectionScore[] {
  const scores: CollectionScore[] = [];
  for (const c of dataset.customers) {
    for (const ar of c.arAging) {
      const signals: CollectionSignals = {
        ageDays: ar.ageDays,
        disputed: ar.disputed,
        promiseToPayDate: ar.promiseToPayDate,
        promiseBroken: ar.promiseBroken,
        partialPayment: ar.partialPayment,
        priorWriteOffs: ar.priorWriteOffs,
      };
      const p = pCollect(signals);
      scores.push({
        customerId: c.customer.id,
        customerName: c.customer.name,
        invoiceNumber: ar.invoiceNumber,
        balanceCents: ar.balanceCents,
        ageDays: ar.ageDays,
        bucket: ar.bucket,
        pCollect: p,
        ervCents: Math.round(ar.balanceCents * p),
        factors: {
          ageDays: ar.ageDays,
          disputed: ar.disputed,
          promiseBroken: ar.promiseBroken,
          promiseKept: !!ar.promiseToPayDate && !ar.promiseBroken,
          partialPayment: ar.partialPayment,
          priorWriteOffs: ar.priorWriteOffs,
        },
        recommendedAction: recommendedAction(signals),
      });
    }
  }
  return scores.sort((a, b) => b.ervCents - a.ervCents);
}

const BUCKET_ORDER: ARBucketT[] = ["current", "1_30", "31_60", "61_90", "90_plus"];

/** Bucket rollup + DSO over the AR ledger. */
export function summarizeARAging(dataset: RevenueDataset): ARAgingSummary {
  const byBucket = new Map<ARBucketT, { count: number; balanceCents: number }>();
  for (const b of BUCKET_ORDER) byBucket.set(b, { count: 0, balanceCents: 0 });

  let totalOpenCents = 0;
  for (const c of dataset.customers) {
    for (const ar of c.arAging) {
      const slot = byBucket.get(ar.bucket)!;
      slot.count += 1;
      slot.balanceCents += ar.balanceCents;
      totalOpenCents += ar.balanceCents;
    }
  }

  // Trailing billed revenue across the export window ≈ annual credit sales.
  const billedCents = dataset.customers.reduce(
    (a, c) => a + c.billings.reduce((s, b) => s + b.totalCents, 0),
    0,
  );
  const dso = billedCents > 0 ? (totalOpenCents / billedCents) * 365 : 0;

  const buckets: ARBucketSummary[] = BUCKET_ORDER.map((bucket) => {
    const slot = byBucket.get(bucket)!;
    return {
      bucket,
      label: BUCKET_LABEL[bucket],
      count: slot.count,
      balanceCents: slot.balanceCents,
    };
  });

  return { buckets, totalOpenCents, dso: Math.round(dso * 10) / 10 };
}

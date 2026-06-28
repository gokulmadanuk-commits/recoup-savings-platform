import { clsx } from "clsx";
import { formatUSD, formatPct } from "@/lib/money";
import type { CollectionScore, RevenueAnalysisResult } from "@/lib/revenue/types";
import { VendorMark } from "../mark";

/* ------------------------------------------------------------------ */
/* Headline tile (mirrors recovery-tracker's Tile)                     */
/* ------------------------------------------------------------------ */

function Tile({
  value,
  label,
  tone = "forest",
}: {
  value: string;
  label: string;
  tone?: "forest" | "verdant";
}) {
  return (
    <div className="rounded-2xl border border-ink/10 bg-paper p-5">
      <div
        className={clsx(
          "font-display text-3xl tabular-nums md:text-4xl",
          tone === "verdant" ? "text-verdant" : "text-forest",
        )}
      >
        {value}
      </div>
      <div className="mt-3 border-t border-gold/50 pt-2">
        <span className="font-ui text-xs uppercase tracking-[0.12em] text-ink-soft">
          {label}
        </span>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* AR-aging bucket styling — current (clean) → 90_plus (distressed).   */
/* ------------------------------------------------------------------ */

type ARBucket = CollectionScore["bucket"];

/** Bar fill for the aging spectrum: verdant for fresh, terracotta for stale. */
const BUCKET_BAR: Record<ARBucket, string> = {
  current: "bg-verdant",
  "1_30": "bg-emerald",
  "31_60": "bg-gold",
  "61_90": "bg-[#c08a2e]",
  "90_plus": "bg-terracotta",
};

/** Pill classes for the queue table's bucket chip. */
const BUCKET_PILL: Record<ARBucket, string> = {
  current: "bg-emerald/10 text-emerald border border-emerald/30",
  "1_30": "bg-emerald/10 text-emerald border border-emerald/30",
  "31_60": "bg-gold/15 text-[#7a5e1f] border border-gold/40",
  "61_90": "bg-gold/15 text-[#7a5e1f] border border-gold/40",
  "90_plus": "bg-terracotta/10 text-terracotta border border-terracotta/30",
};

const BUCKET_LABEL: Record<ARBucket, string> = {
  current: "Current",
  "1_30": "1–30",
  "31_60": "31–60",
  "61_90": "61–90",
  "90_plus": "90+",
};

/* ------------------------------------------------------------------ */
/* Collections Queue                                                   */
/* ------------------------------------------------------------------ */

export function CollectionsQueue({
  collections,
  arAging,
}: {
  collections: CollectionScore[];
  arAging: RevenueAnalysisResult["arAging"];
}) {
  const expectedRecoverableCents = collections.reduce(
    (a, c) => a + c.ervCents,
    0,
  );
  const maxBucketBalance = Math.max(
    1,
    ...arAging.buckets.map((b) => b.balanceCents),
  );

  return (
    <div>
      {/* Headline tiles */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Tile value={formatUSD(arAging.totalOpenCents)} label="Open AR" />
        <Tile value={`${arAging.dso} days`} label="DSO" />
        <Tile
          value={formatUSD(expectedRecoverableCents)}
          label="Expected recoverable"
          tone="verdant"
        />
      </div>

      {/* AR-aging bucket bar */}
      <div className="mt-6 rounded-2xl border border-ink/10 bg-paper p-6">
        <div className="flex items-baseline justify-between">
          <h3 className="font-display text-lg text-forest">AR aging</h3>
          <span className="font-ui text-xs uppercase tracking-[0.12em] text-ink-soft">
            {formatUSD(arAging.totalOpenCents)} open
          </span>
        </div>
        <div className="mt-4 space-y-4">
          {arAging.buckets.map((b) => (
            <div key={b.bucket}>
              <div className="flex items-baseline justify-between font-ui text-sm">
                <span className="text-ink">
                  {b.label}
                  <span className="text-ink-soft">
                    {" "}
                    · {b.count} invoice{b.count === 1 ? "" : "s"}
                  </span>
                </span>
                <span className="tabular-nums text-ink">
                  {formatUSD(b.balanceCents)}
                </span>
              </div>
              <div className="mt-1.5 h-2.5 w-full overflow-hidden rounded-full bg-ink/5">
                <div
                  className={clsx(
                    "h-full rounded-full transition-all duration-700",
                    BUCKET_BAR[b.bucket],
                  )}
                  style={{
                    width: `${(b.balanceCents / maxBucketBalance) * 100}%`,
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Explainer */}
      <p className="mt-6 max-w-3xl font-body text-sm text-ink-soft">
        Ranked by Expected Recoverable Value (balance × probability of
        collection), so the team works the most recoverable first — not merely
        the oldest.
      </p>

      {/* Collections queue table */}
      <div className="mt-3 overflow-hidden rounded-2xl border border-ink/10">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-gold/40 bg-bone/50 font-ui text-[11px] uppercase tracking-[0.1em] text-ink-soft">
                <th className="px-5 py-3 font-semibold">Customer</th>
                <th className="hidden px-5 py-3 font-semibold md:table-cell">
                  Invoice
                </th>
                <th className="px-5 py-3 font-semibold">Age</th>
                <th className="px-5 py-3 text-right font-semibold">Balance</th>
                <th className="hidden px-5 py-3 font-semibold sm:table-cell">
                  P(collect)
                </th>
                <th className="px-5 py-3 text-right font-semibold">ERV</th>
                <th className="hidden px-5 py-3 font-semibold lg:table-cell">
                  Recommended action
                </th>
              </tr>
            </thead>
            <tbody>
              {collections.map((c) => (
                <tr
                  key={`${c.customerId}-${c.invoiceNumber}`}
                  className="border-b border-ink/5 last:border-0 hover:bg-bone/30"
                >
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-3">
                      <VendorMark name={c.customerName} category="" size={22} />
                      <span className="font-body text-ink">
                        {c.customerName}
                      </span>
                    </div>
                  </td>
                  <td className="hidden px-5 py-3 font-ui text-sm tabular-nums text-ink-soft md:table-cell">
                    {c.invoiceNumber}
                  </td>
                  <td className="px-5 py-3">
                    <span
                      className={clsx(
                        "inline-flex items-center rounded-full px-2.5 py-0.5 font-ui text-[11px] font-medium tracking-wide",
                        BUCKET_PILL[c.bucket],
                      )}
                    >
                      {BUCKET_LABEL[c.bucket]}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-right font-ui text-sm tabular-nums text-ink">
                    {formatUSD(c.balanceCents)}
                  </td>
                  <td className="hidden px-5 py-3 sm:table-cell">
                    <div className="flex items-center gap-2">
                      <div className="h-2 w-20 overflow-hidden rounded-full bg-ink/5">
                        <div
                          className="h-full rounded-full bg-emerald transition-all duration-700"
                          style={{
                            width: `${Math.max(0, Math.min(1, c.pCollect)) * 100}%`,
                          }}
                        />
                      </div>
                      <span className="font-ui text-xs tabular-nums text-ink-soft">
                        {formatPct(c.pCollect, 0)}
                      </span>
                    </div>
                  </td>
                  <td className="px-5 py-3 text-right font-ui text-sm font-semibold tabular-nums text-verdant">
                    {formatUSD(c.ervCents)}
                  </td>
                  <td className="hidden px-5 py-3 font-ui text-sm text-ink-soft lg:table-cell">
                    {c.recommendedAction}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

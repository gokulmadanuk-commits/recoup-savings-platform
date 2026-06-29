"use client";

import { clsx } from "clsx";
import type { PriceIncrease } from "@/lib/revenue/types";
import { formatUSD } from "@/lib/money";
import { formatLong } from "@/lib/dates";
import { VendorMark } from "../mark";

/* ------------------------------------------------------------------ */
/* Mechanism pills                                                     */
/* ------------------------------------------------------------------ */

const MECHANISMS: Record<
  PriceIncrease["mechanism"],
  { label: string; classes: string }
> = {
  escalator: {
    label: "escalator",
    classes: "bg-emerald/10 text-emerald border border-emerald/30",
  },
  step: {
    label: "step",
    classes: "bg-gold/15 text-[#7a5e1f] border border-gold/40",
  },
  discount_expiry: {
    label: "discount expiry",
    classes: "bg-terracotta/10 text-terracotta border border-terracotta/30",
  },
  renewal: {
    label: "renewal",
    classes: "bg-sand/50 text-ink-soft border border-ink/15",
  },
};

/* ------------------------------------------------------------------ */
/* Urgency bands (by days until the price action takes effect)         */
/* ------------------------------------------------------------------ */

type BandKey = "overdue" | "now" | "soon" | "later";

const BANDS: {
  key: BandKey;
  label: string;
  /** dot + accent text colour */
  dot: string;
  text: string;
  border: string;
  match: (days: number) => boolean;
}[] = [
  {
    key: "overdue",
    label: "Overdue — should already be billing",
    dot: "bg-terracotta",
    text: "text-terracotta",
    border: "border-l-terracotta",
    match: (d) => d < 0,
  },
  {
    key: "now",
    label: "Acts within 30 days",
    dot: "bg-gold",
    text: "text-gold",
    border: "border-l-gold",
    match: (d) => d >= 0 && d <= 30,
  },
  {
    key: "soon",
    label: "Within 90 days",
    dot: "bg-emerald",
    text: "text-emerald",
    border: "border-l-emerald",
    match: (d) => d > 30 && d <= 90,
  },
  {
    key: "later",
    label: "Later",
    dot: "bg-ink-soft",
    text: "text-ink-soft",
    border: "border-l-ink/30",
    match: (d) => d > 90,
  },
];

function effectiveFraming(days: number): string {
  if (days < 0) return `overdue by ${Math.abs(days)} days`;
  if (days === 0) return "effective today";
  if (days === 1) return "in 1 day";
  return `in ${days} days`;
}

/* ------------------------------------------------------------------ */
/* Component                                                           */
/* ------------------------------------------------------------------ */

export function UpliftCalendar({
  priceIncreases,
}: {
  priceIncreases: PriceIncrease[];
}) {
  const sorted = [...priceIncreases].sort(
    (a, b) => a.daysToEffective - b.daysToEffective,
  );

  const next90 = sorted.filter(
    (p) => p.daysToEffective >= 0 && p.daysToEffective <= 90,
  );
  const next90UpliftCents = next90.reduce((sum, p) => sum + p.upliftCents, 0);
  const overdueCount = sorted.filter((p) => p.daysToEffective < 0).length;

  const grouped = BANDS.map((band) => ({
    band,
    items: sorted.filter((p) => band.match(p.daysToEffective)),
  })).filter((g) => g.items.length > 0);

  return (
    <div>
      {/* Intro line */}
      <p className="max-w-3xl font-body text-ink-soft">
        Every contractual price action — escalator anniversaries, scheduled
        steps, expiring discounts — with the clause and the days until it bites.
      </p>

      {/* Summary tiles */}
      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Tile
          value={String(next90.length)}
          label="Price actions · next 90 days"
          tone="ink"
        />
        <Tile
          value={formatUSD(next90UpliftCents)}
          label="Annualized uplift · 90 days"
          tone="verdant"
        />
        <Tile
          value={String(overdueCount)}
          label="Overdue — not yet billed"
          tone={overdueCount > 0 ? "terracotta" : "ink"}
        />
      </div>

      {/* Count line */}
      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
        <p className="font-ui text-xs uppercase tracking-[0.1em] text-ink-soft">
          {sorted.length} price action{sorted.length === 1 ? "" : "s"} on watch
        </p>
      </div>

      {/* Bands */}
      <div className="mt-6 space-y-8">
        {grouped.map(({ band, items }) => (
          <section key={band.key}>
            <div className="mb-3 flex items-center gap-2.5">
              <span className={clsx("h-2 w-2 rounded-full", band.dot)} />
              <h3
                className={clsx(
                  "font-ui text-xs font-semibold uppercase tracking-[0.12em]",
                  band.text,
                )}
              >
                {band.label}
              </h3>
              <span className="font-ui text-xs tabular-nums text-ink-soft">
                ({items.length})
              </span>
            </div>

            <div className="space-y-3">
              {items.map((p, i) => (
                <UpliftRow
                  key={`${p.customerId}-${p.mechanism}-${p.effectiveDate}-${i}`}
                  increase={p}
                  band={band}
                />
              ))}
            </div>
          </section>
        ))}

        {grouped.length === 0 && (
          <div className="rounded-2xl border border-ink/10 bg-paper p-8 text-center">
            <p className="font-body text-ink-soft">
              No upcoming price actions on watch.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Tile                                                                */
/* ------------------------------------------------------------------ */

function Tile({
  value,
  label,
  tone,
}: {
  value: string;
  label: string;
  tone: "ink" | "verdant" | "terracotta";
}) {
  const valueColor =
    tone === "terracotta"
      ? "text-terracotta"
      : tone === "verdant"
        ? "text-verdant"
        : "text-forest";
  return (
    <div className="rounded-2xl border border-ink/10 bg-paper p-5">
      <div
        className={clsx(
          "font-display text-3xl tabular-nums md:text-4xl",
          valueColor,
        )}
      >
        {value}
      </div>
      <div className="mt-3 border-t border-gold/50 pt-2">
        <span className="font-ui text-[11px] uppercase tracking-[0.12em] text-ink-soft">
          {label}
        </span>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Uplift row                                                          */
/* ------------------------------------------------------------------ */

function UpliftRow({
  increase: p,
  band,
}: {
  increase: PriceIncrease;
  band: (typeof BANDS)[number];
}) {
  const mech = MECHANISMS[p.mechanism];
  return (
    <div
      className={clsx(
        "rounded-2xl border border-ink/10 border-l-2 bg-paper p-5 transition-all duration-300",
        "hover:-translate-y-0.5 hover:border-ink/20 hover:shadow-[0_8px_30px_rgba(31,58,46,0.06)]",
        band.border,
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        {/* Customer identity */}
        <div className="flex min-w-0 items-center gap-3">
          <VendorMark name={p.customerName} category={p.segment} size={36} />
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-body text-ink">{p.customerName}</span>
              <span
                className={clsx(
                  "inline-flex items-center rounded-full px-2.5 py-0.5 font-ui text-[11px] tracking-wide",
                  mech.classes,
                )}
              >
                {mech.label}
              </span>
            </div>
            <div className="font-ui text-xs text-ink-soft">{p.segment}</div>
          </div>
        </div>

        {/* Uplift */}
        <div className="text-right">
          <div className="font-display text-lg tabular-nums text-verdant">
            +{formatUSD(p.upliftCents)}
            <span className="font-ui text-xs text-ink-soft">/yr</span>
          </div>
          <div className="font-ui text-[11px] uppercase tracking-wide text-ink-soft">
            annualized uplift
          </div>
        </div>
      </div>

      {/* Effective date + price move */}
      <div className="mt-4 grid grid-cols-1 gap-4 border-t border-ink/5 pt-4 sm:grid-cols-2">
        <div>
          <div className="font-ui text-[11px] uppercase tracking-[0.1em] text-ink-soft">
            Effective
          </div>
          <div className={clsx("mt-0.5 font-body text-sm", band.text)}>
            {formatLong(p.effectiveDate)}
          </div>
          <div className="mt-0.5 font-ui text-[11px] tabular-nums text-ink-soft">
            {effectiveFraming(p.daysToEffective)}
          </div>
        </div>

        <div>
          <div className="font-ui text-[11px] uppercase tracking-[0.1em] text-ink-soft">
            Price move
          </div>
          {p.currentPriceCents > 0 ? (
            <div className="mt-0.5 font-ui text-sm tabular-nums text-ink">
              {formatUSD(p.currentPriceCents)}
              <span className="px-1.5 text-ink-soft">→</span>
              <span className="text-verdant">
                {formatUSD(p.correctPriceCents)}
              </span>
            </div>
          ) : (
            <div className="mt-0.5 font-ui text-sm tabular-nums text-verdant">
              +{formatUSD(p.upliftCents)} uplift
            </div>
          )}
        </div>
      </div>

      {/* Clause */}
      {p.clause && (
        <div className="mt-4 border-t border-ink/5 pt-3">
          <span className="font-ui text-[11px] uppercase tracking-[0.1em] text-ink-soft">
            Clause ·{" "}
          </span>
          <span className="font-body text-sm text-ink">{p.clause}</span>
        </div>
      )}
    </div>
  );
}

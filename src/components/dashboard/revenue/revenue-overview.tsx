"use client";

import { useState } from "react";
import { clsx } from "clsx";
import type { RevenueAnalysisResult } from "@/lib/revenue/types";
import { formatUSD } from "@/lib/money";

/* Editorial chart palette — same series the cost-side category breakdown uses. */
const SERIES = [
  "#1F3A2E", "#008168", "#B08D45", "#2E7D5B", "#16271F",
  "#0E7490", "#6D28D9", "#A6492F", "#92400E", "#1E3A8A",
];

export function RevenueOverview({
  result,
  onSeeFindings,
}: {
  result: RevenueAnalysisResult;
  onSeeFindings: () => void;
}) {
  const s = result.summary;
  const topFinding = result.findings[0];

  /* ---- headline tiles (mirror tiles.tsx) ---- */
  const small: { label: string; value: string; tone?: "verdant" }[] = [
    { label: "Arrears to date", value: formatUSD(s.totalArrearsCents), tone: "verdant" },
    { label: "Forward uplift /yr", value: formatUSD(s.totalAnnualizedUpliftCents) },
    { label: "Est. RECOUP fee", value: formatUSD(s.estimatedFeeCents) },
    { label: "Open AR", value: formatUSD(s.totalOpenARCents) },
    { label: "DSO", value: `${s.dso} days` },
    { label: "Findings", value: String(s.findingCount) },
    { label: "Customers flagged", value: `${s.customersWithFindings}/${s.customersAnalyzed}` },
    { label: "Documents read", value: String(s.documentsProcessed) },
  ];

  /* ---- enterprise-value impact (mirror value-impact.tsx) ---- */
  const [multiple, setMultiple] = useState(8.4);
  const recurringCents = s.totalAnnualizedUpliftCents;
  const evCents = Math.round(recurringCents * multiple);

  /* ---- category breakdown (mirror category-breakdown.tsx) ---- */
  const max = Math.max(1, ...result.categories.map((c) => c.recoverableCents));

  return (
    <div>
      {/* Headline tile block */}
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="flex flex-col justify-between rounded-3xl bg-forest p-8 text-cream lg:row-span-2">
          <div>
            <p className="eyebrow text-gold">Total recoverable · identified</p>
            <div className="mt-4 font-display text-6xl tabular-nums leading-none md:text-7xl">
              {formatUSD(s.totalRecoverableCents)}
            </div>
          </div>
          <p className="mt-8 font-body text-cream/70">
            across {s.findingCount} findings · {s.customersWithFindings}/{s.customersAnalyzed} customers
            · you pay nothing unless it lands
          </p>
        </div>
        <div className="grid grid-cols-2 gap-4 lg:col-span-2 lg:grid-cols-4">
          {small.map((t) => (
            <div key={t.label} className="rounded-2xl border border-ink/10 bg-paper p-5">
              <div
                className={clsx(
                  "font-display text-2xl tabular-nums",
                  t.tone === "verdant" ? "text-verdant" : "text-forest",
                )}
              >
                {t.value}
              </div>
              <div className="mt-2 font-ui text-[11px] uppercase tracking-[0.1em] text-ink-soft">
                {t.label}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 2/3 + 1/3 grid */}
      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <div className="rounded-2xl border border-ink/10 bg-paper p-6 lg:col-span-2">
          <div className="mb-5 font-ui text-xs uppercase tracking-[0.12em] text-ink-soft">
            Where the money is
          </div>
          <div className="space-y-4">
            {result.categories.map((c, i) => (
              <div key={c.category}>
                <div className="flex items-baseline justify-between font-ui text-sm">
                  <span className="text-ink">
                    {c.label}
                    <span className="text-ink-soft"> · {c.count} finding{c.count === 1 ? "" : "s"}</span>
                  </span>
                  <span className="tabular-nums text-ink">{formatUSD(c.recoverableCents)}</span>
                </div>
                <div className="mt-1.5 h-2.5 w-full overflow-hidden rounded-full bg-ink/5">
                  <div
                    className="h-full rounded-full transition-all duration-700"
                    style={{
                      width: `${(c.recoverableCents / max) * 100}%`,
                      background: SERIES[i % SERIES.length],
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
        {topFinding && (
          <div className="rounded-2xl bg-pine p-6 text-cream">
            <div className="eyebrow text-gold">Top opportunity</div>
            <div className="mt-3 font-display text-4xl tabular-nums">
              {formatUSD(topFinding.totalRecoverableCents)}
            </div>
            <div className="mt-2 font-ui text-sm text-cream/70">{topFinding.customerName}</div>
            <p className="mt-4 font-body text-sm text-cream/80">{topFinding.title}</p>
            <button
              onClick={onSeeFindings}
              className="mt-5 font-ui text-sm text-gold underline decoration-gold/50 underline-offset-4"
            >
              See all findings →
            </button>
          </div>
        )}
      </div>

      {/* Enterprise-value impact */}
      <div className="mt-6">
        <div className="rounded-2xl bg-forest p-7 text-cream">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="eyebrow text-gold">Enterprise-value impact</div>
            <label className="flex items-center gap-3 font-ui text-xs text-cream/70">
              <span className="whitespace-nowrap">EBITDA multiple</span>
              <input
                type="range"
                min={4}
                max={15}
                step={0.1}
                value={multiple}
                onChange={(e) => setMultiple(Number(e.target.value))}
                className="h-1 w-32 cursor-pointer accent-gold"
                aria-label="EBITDA multiple"
              />
              <span className="w-10 tabular-nums text-cream">{multiple.toFixed(1)}×</span>
            </label>
          </div>

          <div className="mt-4 font-display text-5xl tabular-nums leading-none md:text-6xl">
            {formatUSD(evCents)}
          </div>

          <p className="mt-4 max-w-2xl font-body text-sm leading-relaxed text-cream/80">
            At {multiple.toFixed(1)}×, the{" "}
            <span className="text-cream">{formatUSD(recurringCents)}</span> of recovered recurring
            run-rate is worth about{" "}
            <span className="text-cream">{formatUSD(evCents)}</span> of enterprise value at exit — and
            the <span className="text-cream">{formatUSD(s.totalArrearsCents)}</span> of arrears is
            one-time cash on top.
          </p>
          <p className="mt-2 font-ui text-[11px] text-cream/50">
            Recovered recurring revenue flows to EBITDA and is capitalised at the exit multiple;
            arrears are one-time and excluded from the multiple.
          </p>
        </div>
      </div>
    </div>
  );
}

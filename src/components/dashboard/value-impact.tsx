"use client";

import { useState } from "react";
import type { AnalysisResult } from "@/lib/types";
import { formatUSD } from "@/lib/money";

/**
 * Enterprise-value framing for PE-backed buyers — the single most-cited close in
 * the research: a recurring pound/dollar of cost removed is worth a multiple of
 * itself at exit. Applies the EBITDA multiple to RECURRING savings only (one-time
 * recoveries like duplicate payments don't recur, so they don't get the multiple).
 */
const ONE_TIME = new Set(["duplicate"]);

export function ValueImpact({ result }: { result: AnalysisResult }) {
  const [multiple, setMultiple] = useState(8.4);
  const recurringCents = result.findings
    .filter((f) => !ONE_TIME.has(f.category))
    .reduce((a, f) => a + f.annualizedSavingsCents, 0);
  const evCents = Math.round(recurringCents * multiple);

  return (
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
        At a {multiple.toFixed(1)}× multiple, the{" "}
        <span className="text-cream">{formatUSD(recurringCents)}</span> of recurring run-rate savings is
        worth about <span className="text-cream">{formatUSD(evCents)}</span> of enterprise value at exit.
        For a PE-backed business, that reframes the 30% / 20% contingency fee as trivial against the
        value created.
      </p>
      <p className="mt-2 font-ui text-[11px] text-cream/50">
        Recurring savings only — one-time recoveries (e.g. duplicate payments) are excluded. Adjust the
        multiple for the sector.
      </p>
    </div>
  );
}

import { clsx } from "clsx";
import { formatUSD } from "@/lib/money";
import type { AnalysisSummary } from "@/lib/types";

export function Tiles({ summary }: { summary: AnalysisSummary }) {
  const pct =
    summary.totalAnnualSpendCents > 0
      ? (summary.totalAnnualizedSavingsCents / summary.totalAnnualSpendCents) * 100
      : 0;

  const small: { label: string; value: string; tone?: "verdant" }[] = [
    { label: "Recoverable cash", value: formatUSD(summary.totalRecoverableCents), tone: "verdant" },
    { label: "Run-rate avoidance", value: formatUSD(summary.totalAvoidanceCents) },
    { label: "Est. RECOUP fee", value: formatUSD(summary.estimatedFeeCents) },
    { label: "% of annual spend", value: `${pct.toFixed(1)}%` },
    { label: "Findings", value: String(summary.findingCount) },
    { label: "Vendors flagged", value: `${summary.vendorsWithFindings}/${summary.vendorsAnalyzed}` },
    { label: "Documents read", value: String(summary.documentsProcessed) },
    { label: "Annual spend", value: formatUSD(summary.totalAnnualSpendCents) },
  ];

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <div className="flex flex-col justify-between rounded-3xl bg-forest p-8 text-cream lg:row-span-2">
        <div>
          <p className="eyebrow text-gold">Total identified · annualized</p>
          <div className="mt-4 font-display text-6xl tabular-nums leading-none md:text-7xl">
            {formatUSD(summary.totalAnnualizedSavingsCents)}
          </div>
        </div>
        <p className="mt-8 font-body text-cream/70">
          across {summary.findingCount} findings · {pct.toFixed(1)}% of spend · you pay nothing unless
          it lands
        </p>
      </div>
      <div className="grid grid-cols-2 gap-4 lg:col-span-2 lg:grid-cols-4">
        {small.map((s) => (
          <div key={s.label} className="rounded-2xl border border-ink/10 bg-paper p-5">
            <div
              className={clsx(
                "font-display text-2xl tabular-nums",
                s.tone === "verdant" ? "text-verdant" : "text-forest",
              )}
            >
              {s.value}
            </div>
            <div className="mt-2 font-ui text-[11px] uppercase tracking-[0.1em] text-ink-soft">
              {s.label}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

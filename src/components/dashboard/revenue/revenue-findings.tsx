"use client";

import { useState } from "react";
import { clsx } from "clsx";
import type {
  RevenueAnalysisResult,
  RevenueFinding,
  RelationshipRiskGradeT,
} from "@/lib/revenue/types";
import { REV_CATEGORY_LABELS } from "@/lib/revenue/rules/rank";
import { formatUSD } from "@/lib/money";
import { VendorMark } from "@/components/dashboard/mark";

const SEVERITY_STYLE: Record<string, string> = {
  critical: "bg-terracotta/15 text-terracotta",
  urgent: "bg-gold/20 text-[#7a5e1f]",
  high: "bg-emerald/10 text-emerald",
  medium: "bg-ink/5 text-ink-soft",
  watch: "bg-ink/5 text-ink-soft",
};

/** Relationship-risk pill (A/B/C → recommended action). */
const RISK_BADGE: Record<RelationshipRiskGradeT, { label: string; className: string }> = {
  A: {
    label: "Retroactive claim",
    className: "bg-emerald/10 text-emerald border border-emerald/30",
  },
  B: {
    label: "Negotiate + partial",
    className: "bg-gold/15 text-[#7a5e1f] border border-gold/40",
  },
  C: {
    label: "Forward only",
    className: "bg-terracotta/10 text-terracotta border border-terracotta/30",
  },
};

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={clsx(
        "rounded-full px-3.5 py-1.5 font-ui text-xs tracking-wide transition-colors",
        active ? "bg-forest text-cream" : "border border-ink/15 text-ink-soft hover:text-ink",
      )}
    >
      {children}
    </button>
  );
}

function RevenueFindingCard({
  finding,
  segment,
  rank,
}: {
  finding: RevenueFinding;
  segment: string;
  rank: number;
}) {
  const recovery = finding.recoveryType === "arrears";
  const risk = RISK_BADGE[finding.relationshipRisk];
  return (
    <details className="group rounded-2xl border border-ink/10 bg-paper p-6 transition-colors open:border-ink/20 open:bg-bone/40">
      <summary className="flex cursor-pointer list-none items-start justify-between gap-6">
        <div className="flex gap-4">
          <span className="font-display text-xl text-gold/80 tabular-nums">
            {String(rank).padStart(2, "0")}
          </span>
          <VendorMark name={finding.customerName} category={finding.category} size={22} />
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-ui text-xs uppercase tracking-[0.12em] text-ink-soft">
                {finding.customerName}
              </span>
              <span className="rounded-full bg-sand/40 px-2.5 py-0.5 font-ui text-[11px] tracking-wide text-ink-soft">
                {REV_CATEGORY_LABELS[finding.category] ?? finding.category}
              </span>
              <span
                className={clsx(
                  "rounded-full px-2.5 py-0.5 font-ui text-[11px] tracking-wide",
                  risk.className,
                )}
              >
                {risk.label}
              </span>
              {finding.severity === "critical" || finding.severity === "urgent" ? (
                <span
                  className={clsx(
                    "rounded-full px-2.5 py-0.5 font-ui text-[11px] uppercase tracking-wide",
                    SEVERITY_STYLE[finding.severity],
                  )}
                >
                  {finding.severity}
                </span>
              ) : null}
            </div>
            <h3 className="mt-1.5 font-display text-xl leading-snug text-forest">
              {finding.title}
            </h3>
          </div>
        </div>
        <div className="shrink-0 text-right">
          <div
            className={clsx(
              "font-display text-2xl tabular-nums",
              recovery ? "text-verdant" : "text-forest",
            )}
          >
            {formatUSD(finding.totalRecoverableCents)}
          </div>
          <div className="font-ui text-[11px] uppercase tracking-[0.1em] text-ink-soft">
            total recoverable
          </div>
        </div>
      </summary>

      <div className="mt-5 border-t border-ink/10 pt-5">
        <div className="grid gap-4 border-b border-ink/5 pb-4 sm:grid-cols-2">
          <div className="flex items-baseline justify-between gap-4">
            <span className="font-ui text-xs text-ink-soft">Arrears to date</span>
            <span className="font-display text-lg tabular-nums text-verdant">
              {formatUSD(finding.arrearsToDateCents)}
            </span>
          </div>
          <div className="flex items-baseline justify-between gap-4">
            <span className="font-ui text-xs text-ink-soft">Forward uplift / yr</span>
            <span className="font-display text-lg tabular-nums text-forest">
              {formatUSD(finding.annualizedUpliftCents)}
            </span>
          </div>
        </div>

        <p className="mt-5 font-body text-ink-soft">{finding.summary}</p>

        {finding.evidence.length > 0 && (
          <dl className="mt-5 grid gap-x-8 gap-y-2 sm:grid-cols-2">
            {finding.evidence.map((e, i) => (
              <div key={i} className="flex justify-between gap-4 border-b border-ink/5 py-1.5">
                <dt className="font-ui text-xs text-ink-soft">{e.label}</dt>
                <dd className="font-ui text-xs tabular-nums text-ink">{e.value}</dd>
              </div>
            ))}
          </dl>
        )}

        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <div>
            <span className="eyebrow text-emerald">Leverage</span>
            <p className="mt-2 font-body text-sm text-ink-soft">{finding.leverage}</p>
          </div>
          {finding.recommendedAsk && (
            <div>
              <span className="eyebrow text-emerald">The ask</span>
              <p className="mt-2 font-body text-sm text-ink">{finding.recommendedAsk}</p>
            </div>
          )}
        </div>

        {finding.clauseCited && (
          <p className="mt-4 font-ui text-xs text-ink-soft">
            Clause cited: <span className="text-ink">{finding.clauseCited}</span> · Confidence{" "}
            {(finding.confidence * 100).toFixed(0)}%
          </p>
        )}
      </div>
    </details>
  );
}

export function RevenueFindings({ result }: { result: RevenueAnalysisResult }) {
  const [cat, setCat] = useState<string | null>(null);
  const segmentOf = new Map(result.customers.map((c) => [c.id, c.segment]));
  const ranked = [...result.findings].sort(
    (a, b) => b.totalRecoverableCents - a.totalRecoverableCents,
  );
  const rankOf = new Map(ranked.map((f, i) => [f.id, i + 1]));
  const shown = cat ? ranked.filter((f) => f.category === cat) : ranked;

  return (
    <div>
      <div className="mb-5 flex flex-wrap gap-2">
        <Chip active={cat === null} onClick={() => setCat(null)}>
          All · {result.findings.length}
        </Chip>
        {result.categories.map((c) => (
          <Chip key={c.category} active={cat === c.category} onClick={() => setCat(c.category)}>
            {REV_CATEGORY_LABELS[c.category] ?? c.label} · {c.count}
          </Chip>
        ))}
      </div>
      <div className="space-y-3">
        {shown.map((f) => (
          <RevenueFindingCard
            key={f.id}
            finding={f}
            segment={segmentOf.get(f.customerId) ?? ""}
            rank={rankOf.get(f.id) ?? 0}
          />
        ))}
      </div>
    </div>
  );
}

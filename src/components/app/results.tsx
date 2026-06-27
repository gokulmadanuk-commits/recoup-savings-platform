"use client";

import { useState } from "react";
import { clsx } from "clsx";
import type { AnalysisResult, Finding, EmailDraft } from "@/lib/types";
import { formatUSD, formatUSDPrecise } from "@/lib/money";
import { gmailComposeUrl } from "@/lib/gmail";

const CATEGORY_LABEL: Record<string, string> = {
  auto_renewal: "Auto-renewal",
  rate_mismatch: "Off-contract rate",
  unused_seats: "Idle licences",
  price_escalator: "Price escalator",
  overbilling: "Overbilling",
  duplicate: "Duplicate billing",
  missed_discount: "Missed discount",
  tier_optimization: "Right-sizing",
  minimum_commit: "Minimum commitment",
  other: "Other",
};

const SEVERITY_STYLE: Record<string, string> = {
  critical: "bg-terracotta/15 text-terracotta",
  urgent: "bg-gold/20 text-[#7a5e1f]",
  high: "bg-emerald/10 text-emerald",
  medium: "bg-ink/5 text-ink-soft",
  watch: "bg-ink/5 text-ink-soft",
};

export function ResultsSummary({ summary }: { summary: AnalysisResult["summary"] }) {
  const stats = [
    { label: "Recoverable cash", value: formatUSD(summary.totalRecoverableCents) },
    { label: "Run-rate avoidance", value: formatUSD(summary.totalAvoidanceCents) },
    { label: "Annual spend reviewed", value: formatUSD(summary.totalAnnualSpendCents) },
    { label: "Documents read", value: String(summary.documentsProcessed) },
  ];
  const pct =
    summary.totalAnnualSpendCents > 0
      ? (summary.totalAnnualizedSavingsCents / summary.totalAnnualSpendCents) * 100
      : 0;
  return (
    <section className="rounded-3xl bg-forest px-8 py-10 text-cream md:px-12 md:py-14">
      <p className="eyebrow text-gold">{summary.customer}</p>
      <div className="mt-4 flex flex-wrap items-end gap-x-6 gap-y-2">
        <span className="font-display text-6xl tabular-nums md:text-7xl">
          {formatUSD(summary.totalAnnualizedSavingsCents)}
        </span>
        <span className="pb-2 font-body text-cream/70">
          identified across {summary.findingCount} findings · {pct.toFixed(1)}% of spend
        </span>
      </div>
      <div className="mt-10 grid grid-cols-2 gap-8 border-t border-cream/15 pt-8 md:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label}>
            <div className="font-display text-3xl tabular-nums text-cream">{s.value}</div>
            <div className="mt-2 font-ui text-xs uppercase tracking-[0.12em] text-cream/60">
              {s.label}
            </div>
          </div>
        ))}
      </div>
      <p className="mt-8 font-body text-sm text-cream/60">
        Estimated RECOUP fee on realized savings: {formatUSD(summary.estimatedFeeCents)} · You pay
        nothing unless savings land.
      </p>
    </section>
  );
}

function EmailBlock({ draft }: { draft: EmailDraft }) {
  const [copied, setCopied] = useState(false);
  const full = `To: ${draft.to}\nSubject: ${draft.subject}\n\n${draft.body}`;
  return (
    <div className="mt-5 rounded-xl border border-ink/10 bg-bone/60 p-5">
      <div className="flex items-center justify-between">
        <span className="eyebrow text-emerald">Drafted vendor email</span>
        <div className="flex items-center gap-4">
          <a
            href={gmailComposeUrl(draft)}
            target="_blank"
            rel="noopener noreferrer"
            className="font-ui text-xs tracking-wide text-ink-soft underline decoration-gold/60 underline-offset-4 hover:text-ink"
          >
            Open in Gmail
          </a>
          <button
            type="button"
            onClick={() => {
              navigator.clipboard?.writeText(full);
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            }}
            className="font-ui text-xs tracking-wide text-ink-soft underline decoration-gold/60 underline-offset-4 hover:text-ink"
          >
            {copied ? "Copied ✓" : "Copy"}
          </button>
        </div>
      </div>
      <div className="mt-3 font-ui text-xs text-ink-soft">
        <span className="text-ink">To:</span> {draft.to}
      </div>
      <div className="font-ui text-xs text-ink-soft">
        <span className="text-ink">Subject:</span> {draft.subject}
      </div>
      <pre className="mt-3 whitespace-pre-wrap font-body text-sm leading-relaxed text-ink">
        {draft.body}
      </pre>
    </div>
  );
}

export function FindingCard({
  finding,
  draft,
  rank,
}: {
  finding: Finding;
  draft?: EmailDraft;
  rank: number;
}) {
  const recovery = finding.savingsType === "recovery";
  return (
    <details className="group rounded-2xl border border-ink/10 bg-paper p-6 transition-colors open:border-ink/20 open:bg-bone/40">
      <summary className="flex cursor-pointer list-none items-start justify-between gap-6">
        <div className="flex gap-4">
          <span className="font-display text-xl text-gold/80 tabular-nums">
            {String(rank).padStart(2, "0")}
          </span>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-ui text-xs uppercase tracking-[0.12em] text-ink-soft">
                {finding.vendorName}
              </span>
              <span className="rounded-full bg-sand/40 px-2.5 py-0.5 font-ui text-[11px] tracking-wide text-ink-soft">
                {CATEGORY_LABEL[finding.category] ?? finding.category}
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
            {formatUSD(finding.annualizedSavingsCents)}
          </div>
          <div className="font-ui text-[11px] uppercase tracking-[0.1em] text-ink-soft">
            {recovery ? "recoverable / yr" : "avoidance / yr"}
          </div>
        </div>
      </summary>

      <div className="mt-5 border-t border-ink/10 pt-5">
        <p className="font-body text-ink-soft">{finding.summary}</p>

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

        {finding.recoverableToDateCents > 0 && (
          <p className="mt-4 font-ui text-xs text-ink-soft">
            Already overpaid to date: {formatUSDPrecise(finding.recoverableToDateCents)} ·
            Confidence {(finding.confidence * 100).toFixed(0)}%
          </p>
        )}

        {draft && <EmailBlock draft={draft} />}
      </div>
    </details>
  );
}

export function FindingsBook({ result }: { result: AnalysisResult }) {
  const draftsById = new Map(result.drafts.map((d) => [d.findingId, d]));
  return (
    <div className="space-y-3">
      {result.findings.map((f, i) => (
        <FindingCard key={f.id} finding={f} draft={draftsById.get(f.id)} rank={i + 1} />
      ))}
    </div>
  );
}

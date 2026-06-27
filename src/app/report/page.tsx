"use client";

import { useEffect, useMemo, useState } from "react";
import type { AnalysisResult, Finding } from "@/lib/types";
import { formatUSD, formatPct } from "@/lib/money";
import { formatLong } from "@/lib/dates";
import { VendorMark } from "@/components/dashboard/mark";

const REPORT_KEY = "recoup:report";

/** Human label for a finding category code. */
const CATEGORY_LABELS: Record<string, string> = {
  auto_renewal: "Auto-renewal",
  rate_mismatch: "Rate mismatch",
  unused_seats: "Unused seats",
  price_escalator: "Price escalator",
  overbilling: "Overbilling",
  duplicate: "Duplicate",
  missed_discount: "Missed discount",
  tier_optimization: "Tier optimization",
  minimum_commit: "Minimum commit",
  other: "Other",
};

function categoryLabel(c: string): string {
  return CATEGORY_LABELS[c] ?? c.replace(/_/g, " ");
}

/* The print stylesheet. Kept as a raw string so it ships verbatim in a <style>
   tag — Tailwind never sees these rules. force-color-adjust keeps the ivory
   ground and forest/gold accents in the printed PDF instead of being stripped
   to white-on-black. */
const PRINT_CSS = `
@media print {
  @page { margin: 14mm; }
  html, body {
    background: #f5f1e8 !important;
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important;
    forced-color-adjust: exact !important;
  }
  .print\\:hidden { display: none !important; }
  .report-root {
    background: #f5f1e8 !important;
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important;
    forced-color-adjust: exact !important;
  }
  .report-root * {
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important;
  }
  .page-break { break-before: page; page-break-before: always; }
  .avoid-break { break-inside: avoid; page-break-inside: avoid; }
  thead { display: table-header-group; }
  tr { break-inside: avoid; page-break-inside: avoid; }
}
`;

function FigureCallout({
  value,
  label,
  note,
  tone = "ink",
}: {
  value: string;
  label: string;
  note?: string;
  tone?: "ink" | "cream";
}) {
  return (
    <div className="avoid-break">
      <div
        className={`font-display text-3xl tabular-nums md:text-4xl ${
          tone === "cream" ? "text-cream" : "text-forest"
        }`}
      >
        {value}
      </div>
      <div className="mt-3 border-t border-gold/50 pt-2">
        <div
          className={`font-ui text-[11px] uppercase tracking-[0.12em] ${
            tone === "cream" ? "text-cream/70" : "text-ink-soft"
          }`}
        >
          {label}
        </div>
        {note && (
          <div
            className={`mt-1 font-ui text-xs ${
              tone === "cream" ? "text-cream/60" : "text-ink-soft"
            }`}
          >
            {note}
          </div>
        )}
      </div>
    </div>
  );
}

export default function ReportPage() {
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">(
    "loading",
  );

  useEffect(() => {
    try {
      const cached = localStorage.getItem(REPORT_KEY);
      if (cached) {
        setResult(JSON.parse(cached) as AnalysisResult);
        setStatus("ready");
        return;
      }
    } catch {
      /* ignore and fall through to the sample */
    }
    fetch("/api/sample")
      .then((r) => r.json())
      .then((d: AnalysisResult) => {
        setResult(d);
        setStatus("ready");
      })
      .catch(() => setStatus("error"));
  }, []);

  const rankedFindings = useMemo<Finding[]>(
    () =>
      result
        ? [...result.findings].sort(
            (a, b) => b.annualizedSavingsCents - a.annualizedSavingsCents,
          )
        : [],
    [result],
  );

  const rankedVendors = useMemo(
    () =>
      result
        ? [...result.vendors]
            .filter((v) => v.savingsCents > 0)
            .sort((a, b) => b.savingsCents - a.savingsCents)
        : [],
    [result],
  );

  if (status === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-paper">
        <div className="text-center">
          <div className="mx-auto h-10 w-10 animate-spin rounded-full border-2 border-forest/20 border-t-forest" />
          <p className="mt-6 font-display text-2xl text-forest">
            Preparing your report…
          </p>
        </div>
      </div>
    );
  }

  if (status === "error" || !result) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-paper">
        <p className="font-display text-2xl text-forest">
          Couldn&apos;t load the report.
        </p>
      </div>
    );
  }

  const s = result.summary;
  const fee = s.estimatedFeeCents;
  const net = s.totalAnnualizedSavingsCents - fee;
  const spend = s.totalAnnualSpendCents;
  const pctOfSpend =
    spend > 0 ? s.totalAnnualizedSavingsCents / spend : 0;

  return (
    <div className="report-root min-h-screen bg-paper text-ink">
      <style dangerouslySetInnerHTML={{ __html: PRINT_CSS }} />

      {/* Floating print action — hidden when printing */}
      <div className="print:hidden fixed bottom-6 right-6 z-50 flex gap-3">
        <button
          type="button"
          onClick={() => window.print()}
          className="group inline-flex items-center gap-2 rounded-full bg-forest px-6 py-3 font-ui text-sm tracking-wide text-cream shadow-[0_8px_30px_rgba(22,39,31,0.25)] transition-colors hover:bg-pine"
        >
          <span>Print / Save as PDF</span>
          <span className="transition-transform group-hover:translate-x-1">
            →
          </span>
        </button>
      </div>

      <div className="mx-auto max-w-4xl px-6 py-12 md:px-12 md:py-16">
        {/* ---------------- COVER ---------------- */}
        <header className="avoid-break border-b border-gold/50 pb-8">
          <div className="flex flex-wrap items-start justify-between gap-6">
            <div>
              <div className="font-display text-2xl tracking-[0.22em] text-forest">
                RECOUP
              </div>
              <p className="mt-1 font-ui text-[11px] uppercase tracking-[0.14em] text-ink-soft">
                Contract &amp; payables savings report
              </p>
            </div>
            <div className="text-right">
              <div className="font-ui text-[11px] uppercase tracking-[0.12em] text-ink-soft">
                Prepared for
              </div>
              <div className="font-display text-lg text-forest">
                {s.customer}
              </div>
              <div className="mt-1 font-ui text-xs text-ink-soft">
                {formatLong(s.analysisDate)}
              </div>
            </div>
          </div>

          <h1 className="mt-8 max-w-3xl font-display text-4xl leading-[1.1] text-forest md:text-5xl">
            {formatUSD(s.totalAnnualizedSavingsCents)} in annualized savings,
            identified and documented.
          </h1>
          <p className="mt-4 max-w-2xl font-body text-lg text-ink-soft">
            Across {s.vendorsAnalyzed} vendors and {s.documentsProcessed} source
            documents, RECOUP found {s.findingCount} savings opportunities — each
            tied to a contract clause or invoice line, with the leverage and the
            exact ask.
          </p>
        </header>

        {/* ---------------- EXECUTIVE SUMMARY ---------------- */}
        <section className="avoid-break mt-12">
          <div className="font-ui text-[11px] uppercase tracking-[0.14em] text-emerald">
            Executive summary
          </div>
          <h2 className="mt-2 font-display text-2xl text-forest">
            The bottom line
          </h2>

          <div className="mt-8 grid grid-cols-2 gap-x-8 gap-y-10 md:grid-cols-3">
            <FigureCallout
              value={formatUSD(s.totalAnnualizedSavingsCents)}
              label="Total annualized savings"
              note={`${formatPct(pctOfSpend)} of ${formatUSD(spend)} reviewed spend`}
            />
            <FigureCallout
              value={formatUSD(s.totalRecoverableCents)}
              label="Recoverable cash"
              note="Already overpaid — claimable now"
            />
            <FigureCallout
              value={formatUSD(s.totalAvoidanceCents)}
              label="Run-rate avoidance"
              note="Forward savings on go-forward spend"
            />
            <FigureCallout
              value={formatUSD(fee)}
              label="Contingency fee"
              note="Charged only on realized savings"
            />
            <FigureCallout
              value={formatUSD(net)}
              label="Net to you"
              note="After contingency fee"
            />
            <FigureCallout
              value={String(s.findingCount)}
              label="Findings"
              note={`${s.vendorsWithFindings} vendors with opportunities`}
            />
          </div>

          {/* Recoverable vs avoidance bar */}
          <div className="mt-10">
            <div className="flex h-3 w-full overflow-hidden rounded-full bg-bone">
              {s.totalAnnualizedSavingsCents > 0 && (
                <>
                  <div
                    className="h-full bg-forest"
                    style={{
                      width: `${
                        (s.totalRecoverableCents /
                          s.totalAnnualizedSavingsCents) *
                        100
                      }%`,
                    }}
                  />
                  <div
                    className="h-full bg-verdant"
                    style={{
                      width: `${
                        (s.totalAvoidanceCents /
                          s.totalAnnualizedSavingsCents) *
                        100
                      }%`,
                    }}
                  />
                </>
              )}
            </div>
            <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 font-ui text-xs text-ink-soft">
              <span className="inline-flex items-center gap-2">
                <span className="inline-block h-2.5 w-2.5 rounded-full bg-forest" />
                Recoverable cash · {formatUSD(s.totalRecoverableCents)}
              </span>
              <span className="inline-flex items-center gap-2">
                <span className="inline-block h-2.5 w-2.5 rounded-full bg-verdant" />
                Run-rate avoidance · {formatUSD(s.totalAvoidanceCents)}
              </span>
            </div>
          </div>
        </section>

        {/* ---------------- FINDINGS TABLE ---------------- */}
        <section className="page-break mt-14">
          <div className="font-ui text-[11px] uppercase tracking-[0.14em] text-emerald">
            Findings
          </div>
          <h2 className="mt-2 font-display text-2xl text-forest">
            Ranked by annualized savings
          </h2>

          <div className="mt-6 overflow-hidden rounded-2xl border border-ink/10">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-gold/50 bg-bone/60 font-ui text-[10px] uppercase tracking-[0.1em] text-ink-soft">
                  <th className="px-4 py-3 font-semibold">#</th>
                  <th className="px-4 py-3 font-semibold">Vendor</th>
                  <th className="px-4 py-3 font-semibold">Opportunity</th>
                  <th className="px-4 py-3 font-semibold">Type</th>
                  <th className="px-4 py-3 text-right font-semibold">
                    Annualized
                  </th>
                  <th className="px-4 py-3 text-right font-semibold">
                    Recoverable
                  </th>
                </tr>
              </thead>
              <tbody>
                {rankedFindings.map((f, i) => (
                  <tr
                    key={f.id}
                    className="avoid-break border-b border-ink/5 align-top last:border-0"
                  >
                    <td className="px-4 py-3 font-display text-sm tabular-nums text-gold/80">
                      {String(i + 1).padStart(2, "0")}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <VendorMark
                          name={f.vendorName}
                          category={f.category}
                          size={26}
                        />
                        <span className="font-body text-sm text-ink">
                          {f.vendorName}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-body text-sm leading-snug text-forest">
                        {f.title}
                      </div>
                      <div className="mt-0.5 font-ui text-[11px] uppercase tracking-wide text-ink-soft">
                        {categoryLabel(f.category)} · {f.ruleName}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex rounded-full px-2.5 py-0.5 font-ui text-[10px] uppercase tracking-wide ${
                          f.savingsType === "recovery"
                            ? "bg-forest/10 text-forest"
                            : "bg-verdant/12 text-verdant"
                        }`}
                      >
                        {f.savingsType === "recovery" ? "Recovery" : "Avoidance"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right font-ui text-sm tabular-nums text-forest">
                      {formatUSD(f.annualizedSavingsCents)}
                    </td>
                    <td className="px-4 py-3 text-right font-ui text-sm tabular-nums text-ink-soft">
                      {f.recoverableToDateCents > 0
                        ? formatUSD(f.recoverableToDateCents)
                        : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-gold/50 bg-bone/40 font-ui text-sm">
                  <td className="px-4 py-3" colSpan={4}>
                    <span className="font-ui text-[11px] uppercase tracking-[0.1em] text-ink-soft">
                      Total · {rankedFindings.length} findings
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right font-display tabular-nums text-forest">
                    {formatUSD(s.totalAnnualizedSavingsCents)}
                  </td>
                  <td className="px-4 py-3 text-right font-display tabular-nums text-ink-soft">
                    {formatUSD(s.totalRecoverableCents)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </section>

        {/* ---------------- VENDOR LEADERBOARD ---------------- */}
        <section className="avoid-break mt-14">
          <div className="font-ui text-[11px] uppercase tracking-[0.14em] text-emerald">
            Vendors
          </div>
          <h2 className="mt-2 font-display text-2xl text-forest">
            Where the savings sit
          </h2>

          <div className="mt-6 space-y-2.5">
            {rankedVendors.map((v) => {
              const max = rankedVendors[0]?.savingsCents || 1;
              const pct = Math.max(4, (v.savingsCents / max) * 100);
              return (
                <div
                  key={v.id}
                  className="avoid-break flex items-center gap-4 rounded-xl border border-ink/10 bg-paper px-4 py-3"
                >
                  <VendorMark name={v.name} category={v.category} size={30} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="truncate font-body text-sm text-ink">
                        {v.name}
                      </span>
                      <span className="shrink-0 font-ui text-sm tabular-nums text-forest">
                        {formatUSD(v.savingsCents)}
                      </span>
                    </div>
                    <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-bone">
                      <div
                        className="h-full rounded-full bg-verdant"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <div className="mt-1 font-ui text-[11px] text-ink-soft">
                      {v.category} · {formatUSD(v.annualSpendCents)} annual spend
                      · {v.findingCount}{" "}
                      {v.findingCount === 1 ? "finding" : "findings"}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* ---------------- METHODOLOGY / FOOTER ---------------- */}
        <section className="avoid-break mt-14 border-t border-gold/50 pt-8">
          <div className="font-ui text-[11px] uppercase tracking-[0.14em] text-emerald">
            Methodology
          </div>
          <h2 className="mt-2 font-display text-2xl text-forest">
            How these numbers were found
          </h2>
          <div className="mt-4 grid gap-6 font-body text-sm leading-relaxed text-ink-soft md:grid-cols-2">
            <p>
              RECOUP normalizes every contract, invoice, and usage export into a
              single canonical model, then runs a library of detection rules
              against it — rate-card mismatches, uncapped escalators, unused
              seats, overbilling, duplicate charges, missed early-pay discounts,
              and minimum-commitment gaps. Every figure traces to a specific
              clause or invoice line.
            </p>
            <p>
              <strong className="text-ink">Annualized savings</strong> express
              each opportunity as a comparable yearly figure.{" "}
              <strong className="text-ink">Recoverable cash</strong> is money
              already overpaid and claimable today;{" "}
              <strong className="text-ink">run-rate avoidance</strong> is
              forward savings on go-forward spend. RECOUP is paid a{" "}
              {formatPct(result.findings[0]?.feeRate ?? 0, 0)} contingency fee on
              realized savings only — net to {s.customer} is{" "}
              {formatUSD(net)}.
            </p>
          </div>

          <div className="mt-10 flex flex-wrap items-center justify-between gap-3 border-t border-ink/10 pt-5 font-ui text-xs text-ink-soft">
            <span>
              RECOUP · {s.customer} · {formatLong(s.analysisDate)}
            </span>
            <span>
              {s.documentsProcessed} documents reviewed
              {s.documentsFailed > 0 && ` · ${s.documentsFailed} unreadable`} · You
              owe nothing unless we save you money
            </span>
          </div>
        </section>
      </div>
    </div>
  );
}

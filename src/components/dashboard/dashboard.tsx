"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { clsx } from "clsx";
import type { AnalysisResult } from "@/lib/types";
import { Eyebrow } from "@/components/ui/primitives";
import { formatUSD } from "@/lib/money";
import { formatLong } from "@/lib/dates";
import { Tiles } from "./tiles";
import { CategoryBreakdown } from "./category-breakdown";
import { VendorsPanel } from "./vendors-panel";
import { DocumentsPanel } from "./documents-panel";
import { EmailQueue } from "./email-queue";
import { FindingsSection } from "./findings-section";
import { UploadCard } from "./upload-card";
import { RecoveryTracker } from "./recovery-tracker";
import { RenewalCalendar } from "./renewal-calendar";
import { ReportButtons } from "./report-buttons";

type SectionId = "overview" | "findings" | "recovery" | "renewals" | "vendors" | "documents" | "emails";

const SECTIONS: { id: SectionId; label: string; eyebrow: string; title: string; subtitle: string }[] = [
  { id: "overview", label: "Overview", eyebrow: "Overview", title: "The book of savings", subtitle: "Everything we found, at a glance." },
  { id: "findings", label: "Findings", eyebrow: "Findings", title: "Ranked by what you can claw back", subtitle: "Each finding ties to its source document, with the leverage and the exact ask. Filter by category." },
  { id: "recovery", label: "Recovery", eyebrow: "Recovery", title: "Recovery tracker", subtitle: "Move each finding from identified to posted cash — and watch the realization rate climb." },
  { id: "renewals", label: "Renewals", eyebrow: "Renewals", title: "Renewal calendar", subtitle: "Every contract's renewal and notice deadline — act before the window closes." },
  { id: "vendors", label: "Vendors", eyebrow: "Vendors", title: "Vendor leaderboard", subtitle: "Annual spend reviewed against savings identified." },
  { id: "documents", label: "Documents", eyebrow: "Source documents", title: "Everything we read", subtitle: "The contracts and invoices behind every finding — downloadable, with the clauses we extracted." },
  { id: "emails", label: "Email queue", eyebrow: "Action queue", title: "Vendor emails, pre-drafted", subtitle: "Connect Gmail to open each email as a ready-to-send draft — the leverage and the number already written in." },
];

function scrollToUpload() {
  document.getElementById("upload-card")?.scrollIntoView({ behavior: "smooth", block: "start" });
}

export function Dashboard() {
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [active, setActive] = useState<SectionId>("overview");

  useEffect(() => {
    try {
      const cached = sessionStorage.getItem("recoup:analysis");
      if (cached) {
        setResult(JSON.parse(cached));
        setStatus("ready");
        return;
      }
    } catch {
      /* ignore */
    }
    fetch("/api/sample")
      .then((r) => r.json())
      .then((d) => {
        setResult(d);
        setStatus("ready");
      })
      .catch(() => setStatus("error"));
  }, []);

  function handleResult(r: AnalysisResult) {
    setResult(r);
    setActive("overview");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  if (status === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-paper">
        <div className="text-center">
          <div className="mx-auto h-10 w-10 animate-spin rounded-full border-2 border-forest/20 border-t-forest" />
          <p className="mt-6 font-display text-2xl text-forest">Loading your dashboard…</p>
        </div>
      </div>
    );
  }

  if (status === "error" || !result) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-paper">
        <div className="text-center">
          <p className="font-display text-2xl text-forest">Couldn&apos;t load the analysis.</p>
          <Link href="/" className="mt-4 inline-block font-ui text-sm text-emerald underline underline-offset-4">
            Back to site →
          </Link>
        </div>
      </div>
    );
  }

  const s = result.summary;
  const meta = SECTIONS.find((x) => x.id === active)!;
  const topFinding = result.findings[0];

  return (
    <div className="min-h-screen bg-paper lg:flex">
      {/* Left rail */}
      <aside className="border-b border-ink/10 bg-bone/40 lg:sticky lg:top-0 lg:h-screen lg:w-72 lg:shrink-0 lg:border-b-0 lg:border-r">
        <div className="flex h-full flex-col gap-6 p-6">
          <div>
            <Link href="/" className="font-display text-xl tracking-[0.2em] text-forest">
              RECOUP
            </Link>
            <p className="mt-1.5 truncate font-ui text-[11px] uppercase tracking-[0.12em] text-ink-soft">
              {s.customer}
            </p>
          </div>

          <nav className="flex gap-1 overflow-x-auto lg:flex-col">
            {SECTIONS.map((sec) => (
              <button
                key={sec.id}
                onClick={() => setActive(sec.id)}
                className={clsx(
                  "whitespace-nowrap rounded-lg px-3 py-2 text-left font-ui text-sm transition-colors",
                  active === sec.id
                    ? "bg-forest text-cream"
                    : "text-ink-soft hover:bg-ink/5 hover:text-ink",
                )}
              >
                {sec.label}
              </button>
            ))}
          </nav>

          <div className="hidden lg:block">
            <hr className="border-0 border-t border-gold/40" />
          </div>

          <button
            onClick={scrollToUpload}
            className="group rounded-2xl border border-forest/20 bg-paper p-4 text-left transition-colors hover:border-forest/50"
          >
            <div className="flex items-center gap-1.5 font-ui text-sm font-medium text-forest">
              Try it on your own data
              <span className="transition-transform group-hover:translate-x-0.5">→</span>
            </div>
            <div className="mt-1 font-ui text-xs text-ink-soft">Upload your contracts &amp; invoices</div>
          </button>

          <div className="mt-auto hidden pt-2 lg:block">
            <Link href="/" className="font-ui text-xs text-ink-soft transition-colors hover:text-ink">
              ← Back to site
            </Link>
          </div>
        </div>
      </aside>

      {/* Main */}
      <main className="min-w-0 flex-1">
        <div className="mx-auto max-w-6xl px-6 py-10 md:px-10 md:py-12">
          {/* Intro */}
          <div className="flex flex-wrap items-end justify-between gap-3 border-b border-ink/10 pb-8">
            <div>
              <Eyebrow className="text-emerald">Savings analysis</Eyebrow>
              <h1 className="mt-2 font-display text-3xl text-forest md:text-4xl">{s.customer}</h1>
            </div>
            <div className="flex flex-col items-start gap-3 sm:items-end">
              <p className="font-ui text-sm text-ink-soft">
                {s.documentsProcessed} documents · {s.vendorsAnalyzed} vendors · {formatLong(s.analysisDate)}
                {s.documentsFailed > 0 && <span className="text-terracotta"> · {s.documentsFailed} unreadable</span>}
              </p>
              <ReportButtons result={result} />
            </div>
          </div>

          {/* Active section heading */}
          <div className="mb-8 mt-10">
            <Eyebrow>{meta.eyebrow}</Eyebrow>
            <h2 className="mt-2 font-display text-3xl text-forest md:text-4xl">{meta.title}</h2>
            <p className="mt-1.5 max-w-2xl font-body text-ink-soft">{meta.subtitle}</p>
          </div>

          {/* Active section body */}
          {active === "overview" && (
            <div>
              <Tiles summary={s} />
              <div className="mt-6 grid gap-6 lg:grid-cols-3">
                <div className="rounded-2xl border border-ink/10 bg-paper p-6 lg:col-span-2">
                  <div className="mb-5 font-ui text-xs uppercase tracking-[0.12em] text-ink-soft">
                    Where the money is
                  </div>
                  <CategoryBreakdown categories={result.categories} />
                </div>
                {topFinding && (
                  <div className="rounded-2xl bg-pine p-6 text-cream">
                    <div className="eyebrow text-gold">Top opportunity</div>
                    <div className="mt-3 font-display text-4xl tabular-nums">
                      {formatUSD(topFinding.annualizedSavingsCents)}
                    </div>
                    <div className="mt-2 font-ui text-sm text-cream/70">{topFinding.vendorName}</div>
                    <p className="mt-4 font-body text-sm text-cream/80">{topFinding.title}</p>
                    <button
                      onClick={() => setActive("findings")}
                      className="mt-5 font-ui text-sm text-gold underline decoration-gold/50 underline-offset-4"
                    >
                      See all findings →
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
          {active === "findings" && <FindingsSection result={result} />}
          {active === "recovery" && <RecoveryTracker findings={result.findings} drafts={result.drafts} />}
          {active === "renewals" && <RenewalCalendar renewals={result.renewals} />}
          {active === "vendors" && <VendorsPanel vendors={result.vendors} />}
          {active === "documents" && <DocumentsPanel documents={result.documents} />}
          {active === "emails" && <EmailQueue drafts={result.drafts} findings={result.findings} />}

          {/* Upload box below every section */}
          <UploadCard id="upload-card" onResult={handleResult} />
        </div>
      </main>
    </div>
  );
}

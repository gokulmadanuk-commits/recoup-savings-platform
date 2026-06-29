"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { clsx } from "clsx";
import type { AnalysisResult } from "@/lib/types";
import type { RevenueAnalysisResult } from "@/lib/revenue/types";
import { IS_REVENUE } from "@/lib/product";
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
import { ValueImpact } from "./value-impact";
// Revenue-leakage section components.
import { RevenueOverview } from "./revenue/revenue-overview";
import { RevenueFindings } from "./revenue/revenue-findings";
import { RealizationTracker } from "./revenue/realization-tracker";
import { UpliftCalendar } from "./revenue/uplift-calendar";
import { CustomersPanel } from "./revenue/customers-panel";
import { CollectionsQueue } from "./revenue/collections-queue";
import { RevenueDocuments } from "./revenue/revenue-documents";
import { RevenueEmailQueue } from "./revenue/revenue-email-queue";

type Section = { id: string; label: string; eyebrow: string; title: string; subtitle: string };

const COST_SECTIONS: Section[] = [
  { id: "overview", label: "Overview", eyebrow: "Overview", title: "The book of savings", subtitle: "Everything we found, at a glance." },
  { id: "findings", label: "Findings", eyebrow: "Findings", title: "Ranked by what you can claw back", subtitle: "Each finding ties to its source document, with the leverage and the exact ask. Filter by category." },
  { id: "recovery", label: "Recovery", eyebrow: "Recovery", title: "Recovery tracker", subtitle: "Move each finding from identified to posted cash — and watch the realization rate climb." },
  { id: "renewals", label: "Renewals", eyebrow: "Renewals", title: "Renewal calendar", subtitle: "Every contract's renewal and notice deadline — act before the window closes." },
  { id: "vendors", label: "Vendors", eyebrow: "Vendors", title: "Vendor leaderboard", subtitle: "Annual spend reviewed against savings identified." },
  { id: "documents", label: "Documents", eyebrow: "Source documents", title: "Everything we read", subtitle: "The contracts and invoices behind every finding — downloadable, with the clauses we extracted." },
  { id: "emails", label: "Email queue", eyebrow: "Action queue", title: "Vendor emails, pre-drafted", subtitle: "Connect Gmail to open each email as a ready-to-send draft — the leverage and the number already written in." },
];

const REVENUE_SECTIONS: Section[] = [
  { id: "rev_overview", label: "Overview", eyebrow: "Revenue leakage", title: "The book of recoverable revenue", subtitle: "What your customers are underpaying you — contracted terms reconciled against what was actually billed." },
  { id: "rev_findings", label: "Findings", eyebrow: "Findings", title: "Ranked by what you're contractually owed", subtitle: "Arrears to date plus forward run-rate uplift, each graded by relationship risk: silent forward correction vs. retroactive claim." },
  { id: "rev_realization", label: "Realization", eyebrow: "Realization", title: "Realization tracker", subtitle: "Move each finding from identified to collected cash — corrected invoices and price-increase notices." },
  { id: "rev_uplift", label: "Uplift calendar", eyebrow: "Uplift calendar", title: "Price actions ahead", subtitle: "Escalator anniversaries, scheduled steps and expiring discounts — with the clause and the days until each bites." },
  { id: "rev_customers", label: "Customers", eyebrow: "Customers", title: "Customer leaderboard", subtitle: "Revenue under management reviewed against leakage identified." },
  { id: "rev_collections", label: "Collections", eyebrow: "Collections", title: "Collections queue", subtitle: "Open AR ranked by Expected Recoverable Value — work the most recoverable first, not merely the oldest." },
  { id: "rev_documents", label: "Documents", eyebrow: "Source documents", title: "Everything we read", subtitle: "Customer contracts, billing exports and statements of account behind every finding — downloadable, with the clauses we extracted." },
  { id: "rev_emails", label: "Notice queue", eyebrow: "Action queue", title: "Customer notices, pre-drafted", subtitle: "Connect Gmail to open each corrected-invoice or price-increase notice as a ready-to-send draft." },
];

const SECTIONS = IS_REVENUE ? REVENUE_SECTIONS : COST_SECTIONS;

function scrollToUpload() {
  document.getElementById("upload-card")?.scrollIntoView({ behavior: "smooth", block: "start" });
}

export function Dashboard() {
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [revenueResult, setRevenueResult] = useState<RevenueAnalysisResult | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [active, setActive] = useState<string>(SECTIONS[0].id);

  // Load this product's analysis (cost vs revenue) once on mount.
  useEffect(() => {
    if (IS_REVENUE) {
      try {
        const cached = sessionStorage.getItem("recoup:revenue-analysis");
        if (cached) {
          setRevenueResult(JSON.parse(cached));
          setStatus("ready");
          return;
        }
      } catch {
        /* ignore */
      }
      fetch("/api/revenue/sample")
        .then((r) => r.json())
        .then((d) => {
          setRevenueResult(d);
          setStatus("ready");
          try {
            sessionStorage.setItem("recoup:revenue-analysis", JSON.stringify(d));
          } catch {
            /* ignore */
          }
        })
        .catch(() => setStatus("error"));
      return;
    }
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

  function goTo(id: string) {
    setActive(id);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

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

  if (status === "error" || (IS_REVENUE ? !revenueResult : !result)) {
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

  const meta = SECTIONS.find((x) => x.id === active)!;
  const customerLabel = IS_REVENUE ? revenueResult!.summary.seller : result!.summary.customer;

  return (
    <div className="min-h-screen bg-paper lg:flex">
      {/* Left rail */}
      <aside className="border-b border-ink/10 bg-bone/40 lg:sticky lg:top-0 lg:h-screen lg:w-72 lg:shrink-0 lg:overflow-y-auto lg:border-b-0 lg:border-r">
        <div className="flex h-full flex-col gap-6 p-6">
          <div>
            <Link href="/" className="font-display text-xl tracking-[0.2em] text-forest">
              RECOUP
            </Link>
            <p className="mt-1.5 font-ui text-[10px] uppercase tracking-[0.14em] text-emerald">
              {IS_REVENUE ? "Revenue Leakage" : "Cost Reduction"}
            </p>
            <p className="mt-1 truncate font-ui text-[11px] uppercase tracking-[0.12em] text-ink-soft">
              {customerLabel}
            </p>
          </div>

          <nav className="flex gap-1 overflow-x-auto lg:flex-col">
            {SECTIONS.map((sec) => (
              <button
                key={sec.id}
                onClick={() => goTo(sec.id)}
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

          {!IS_REVENUE && (
            <>
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
            </>
          )}

          <div className="mt-auto hidden pt-2 lg:block">
            <Link href="/" className="font-ui text-xs text-ink-soft transition-colors hover:text-ink">
              ← Back to site
            </Link>
          </div>
        </div>
      </aside>

      {/* Main */}
      <main className="min-w-0 flex-1">
        <div className="mx-auto w-full max-w-[112rem] px-6 py-10 md:px-10 md:py-12">
          {/* Intro */}
          <div className="flex flex-wrap items-end justify-between gap-3 border-b border-ink/10 pb-8">
            <div>
              <Eyebrow className="text-emerald">
                {IS_REVENUE ? "Revenue leakage analysis" : "Savings analysis"}
              </Eyebrow>
              <h1 className="mt-2 font-display text-3xl text-forest md:text-4xl">{customerLabel}</h1>
            </div>
            <div className="flex flex-col items-start gap-3 sm:items-end">
              {IS_REVENUE ? (
                <p className="font-ui text-sm text-ink-soft">
                  {revenueResult!.summary.documentsProcessed} documents · {revenueResult!.summary.customersAnalyzed} customers · {formatLong(revenueResult!.summary.analysisDate)}
                </p>
              ) : (
                <>
                  <p className="font-ui text-sm text-ink-soft">
                    {result!.summary.documentsProcessed} documents · {result!.summary.vendorsAnalyzed} vendors · {formatLong(result!.summary.analysisDate)}
                    {result!.summary.documentsFailed > 0 && (
                      <span className="text-terracotta"> · {result!.summary.documentsFailed} unreadable</span>
                    )}
                  </p>
                  <ReportButtons result={result!} />
                </>
              )}
            </div>
          </div>

          {/* Active section heading */}
          <div className="mb-8 mt-10">
            <Eyebrow>{meta.eyebrow}</Eyebrow>
            <h2 className="mt-2 font-display text-3xl text-forest md:text-4xl">{meta.title}</h2>
            <p className="mt-1.5 max-w-2xl font-body text-ink-soft">{meta.subtitle}</p>
          </div>

          {/* ───────── Cost Reduction ───────── */}
          {!IS_REVENUE && result && (
            <>
              {active === "overview" && (
                <div>
                  <Tiles summary={result.summary} />
                  <div className="mt-6 grid gap-6 lg:grid-cols-3">
                    <div className="rounded-2xl border border-ink/10 bg-paper p-6 lg:col-span-2">
                      <div className="mb-5 font-ui text-xs uppercase tracking-[0.12em] text-ink-soft">
                        Where the money is
                      </div>
                      <CategoryBreakdown categories={result.categories} />
                    </div>
                    {result.findings[0] && (
                      <div className="rounded-2xl bg-pine p-6 text-cream">
                        <div className="eyebrow text-gold">Top opportunity</div>
                        <div className="mt-3 font-display text-4xl tabular-nums">
                          {formatUSD(result.findings[0].annualizedSavingsCents)}
                        </div>
                        <div className="mt-2 font-ui text-sm text-cream/70">{result.findings[0].vendorName}</div>
                        <p className="mt-4 font-body text-sm text-cream/80">{result.findings[0].title}</p>
                        <button
                          onClick={() => goTo("findings")}
                          className="mt-5 font-ui text-sm text-gold underline decoration-gold/50 underline-offset-4"
                        >
                          See all findings →
                        </button>
                      </div>
                    )}
                  </div>
                  <div className="mt-6">
                    <ValueImpact result={result} />
                  </div>
                </div>
              )}
              {active === "findings" && <FindingsSection result={result} />}
              {active === "recovery" && <RecoveryTracker findings={result.findings} drafts={result.drafts} />}
              {active === "renewals" && <RenewalCalendar renewals={result.renewals} />}
              {active === "vendors" && <VendorsPanel vendors={result.vendors} />}
              {active === "documents" && <DocumentsPanel documents={result.documents} />}
              {active === "emails" && <EmailQueue drafts={result.drafts} findings={result.findings} />}
              <UploadCard id="upload-card" onResult={handleResult} />
            </>
          )}

          {/* ───────── Revenue Leakage ───────── */}
          {IS_REVENUE && revenueResult && (
            <>
              {active === "rev_overview" && (
                <RevenueOverview result={revenueResult} onSeeFindings={() => goTo("rev_findings")} />
              )}
              {active === "rev_findings" && <RevenueFindings result={revenueResult} />}
              {active === "rev_realization" && (
                <RealizationTracker findings={revenueResult.findings} drafts={revenueResult.drafts} />
              )}
              {active === "rev_uplift" && <UpliftCalendar priceIncreases={revenueResult.priceIncreases} />}
              {active === "rev_customers" && <CustomersPanel customers={revenueResult.customers} />}
              {active === "rev_collections" && (
                <CollectionsQueue collections={revenueResult.collections} arAging={revenueResult.arAging} />
              )}
              {active === "rev_documents" && <RevenueDocuments documents={revenueResult.documents} />}
              {active === "rev_emails" && (
                <RevenueEmailQueue drafts={revenueResult.drafts} findings={revenueResult.findings} />
              )}
            </>
          )}
        </div>
      </main>
    </div>
  );
}

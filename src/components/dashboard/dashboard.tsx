"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { clsx } from "clsx";
import type { AnalysisResult } from "@/lib/types";
import { Container, Eyebrow } from "@/components/ui/primitives";
import { formatUSD } from "@/lib/money";
import { formatLong } from "@/lib/dates";
import { Tiles } from "./tiles";
import { CategoryBreakdown } from "./category-breakdown";
import { VendorsPanel } from "./vendors-panel";
import { DocumentsPanel } from "./documents-panel";
import { EmailQueue } from "./email-queue";
import { FindingsSection } from "./findings-section";

const SECTIONS = [
  { id: "overview", label: "Overview" },
  { id: "findings", label: "Findings" },
  { id: "vendors", label: "Vendors" },
  { id: "documents", label: "Documents" },
  { id: "emails", label: "Email queue" },
];

function Section({
  id,
  eyebrow,
  title,
  subtitle,
  children,
}: {
  id: string;
  eyebrow: string;
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-32 border-t border-ink/10 py-12 first:border-0">
      <div className="mb-7">
        <Eyebrow>{eyebrow}</Eyebrow>
        <h2 className="mt-2 font-display text-3xl text-forest">{title}</h2>
        {subtitle && <p className="mt-1.5 font-body text-ink-soft">{subtitle}</p>}
      </div>
      {children}
    </section>
  );
}

export function Dashboard() {
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");

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
          <Link href="/analyze" className="mt-4 inline-block font-ui text-sm text-emerald underline underline-offset-4">
            Start a new analysis →
          </Link>
        </div>
      </div>
    );
  }

  const s = result.summary;
  const topFinding = result.findings[0];

  return (
    <main className="min-h-screen bg-paper pb-20">
      {/* Top bar */}
      <header className="sticky top-0 z-40 border-b border-ink/10 bg-paper/90 backdrop-blur">
        <Container className="flex items-center justify-between py-4">
          <div className="flex items-baseline gap-4">
            <Link href="/" className="font-display text-xl tracking-[0.2em] text-forest">
              RECOUP
            </Link>
            <span className="hidden font-ui text-sm text-ink-soft sm:inline">{s.customer}</span>
          </div>
          <nav className="hidden items-center gap-6 md:flex">
            {SECTIONS.map((sec) => (
              <a key={sec.id} href={`#${sec.id}`} className="font-ui text-sm text-ink-soft transition-colors hover:text-ink">
                {sec.label}
              </a>
            ))}
          </nav>
          <Link
            href="/analyze"
            className="rounded-full bg-forest px-4 py-2 font-ui text-sm text-cream transition-colors hover:bg-pine"
          >
            New analysis
          </Link>
        </Container>
      </header>

      <Container className="pt-10">
        {/* Intro line */}
        <div className="flex flex-wrap items-end justify-between gap-3 pb-2">
          <div>
            <Eyebrow className="text-emerald">Savings analysis</Eyebrow>
            <h1 className="mt-2 font-display text-4xl text-forest md:text-5xl">{s.customer}</h1>
          </div>
          <p className="font-ui text-sm text-ink-soft">
            {s.documentsProcessed} documents · {s.vendorsAnalyzed} vendors · {formatLong(s.analysisDate)}
            {s.documentsFailed > 0 && <span className="text-terracotta"> · {s.documentsFailed} unreadable</span>}
          </p>
        </div>

        {/* Overview */}
        <Section id="overview" eyebrow="Overview" title="The book of savings">
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
                <a href="#findings" className="mt-5 inline-block font-ui text-sm text-gold underline decoration-gold/50 underline-offset-4">
                  See all findings →
                </a>
              </div>
            )}
          </div>
        </Section>

        {/* Findings */}
        <Section
          id="findings"
          eyebrow="Findings"
          title="Ranked by what you can claw back"
          subtitle="Each finding ties to its source document, with the leverage and the exact ask. Filter by category."
        >
          <FindingsSection result={result} />
        </Section>

        {/* Vendors */}
        <Section id="vendors" eyebrow="Vendors" title="Vendor leaderboard" subtitle="Annual spend reviewed against savings identified.">
          <VendorsPanel vendors={result.vendors} />
        </Section>

        {/* Documents */}
        <Section
          id="documents"
          eyebrow="Source documents"
          title="Everything we read"
          subtitle="The contracts and invoices behind every finding — downloadable, with the clauses we extracted."
        >
          <DocumentsPanel documents={result.documents} />
        </Section>

        {/* Emails */}
        <Section
          id="emails"
          eyebrow="Action queue"
          title="Vendor emails, pre-drafted"
          subtitle="Connect Gmail to open each email as a ready-to-send draft — the leverage and the number already written in."
        >
          <EmailQueue drafts={result.drafts} findings={result.findings} />
        </Section>
      </Container>
    </main>
  );
}

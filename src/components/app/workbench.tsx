"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { clsx } from "clsx";
import type { AnalysisResult } from "@/lib/types";
import { Button, Eyebrow } from "@/components/ui/primitives";
import { ResultsSummary, FindingsBook } from "./results";

type Result = AnalysisResult & { failures?: { fileName: string; reason: string }[] };
type Status = "idle" | "loading" | "done" | "error";

const STEPS = [
  "Reading tables and schedules inside every document…",
  "Matching invoice line items back to each contract…",
  "Checking renewals, rates, seats, escalators and duplicates…",
  "Ranking findings by what they're worth…",
];

export function Workbench() {
  const [status, setStatus] = useState<Status>("idle");
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  async function loadSample() {
    setStatus("loading");
    setError(null);
    try {
      const res = await fetch("/api/sample");
      if (!res.ok) throw new Error(`Sample failed (${res.status})`);
      setResult(await res.json());
      setStatus("done");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load sample.");
      setStatus("error");
    }
  }

  async function analyzeUpload() {
    if (files.length === 0) return;
    setStatus("loading");
    setError(null);
    try {
      const form = new FormData();
      for (const f of files) form.append("files", f);
      const res = await fetch("/api/analyze", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `Analysis failed (${res.status})`);
      setResult(data);
      setStatus("done");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Analysis failed.");
      setStatus("error");
    }
  }

  function reset() {
    setStatus("idle");
    setResult(null);
    setError(null);
    setFiles([]);
    if (inputRef.current) inputRef.current.value = "";
  }

  if (status === "done" && result) {
    return (
      <div className="space-y-10">
        <ResultsSummary summary={result.summary} />
        {result.failures && result.failures.length > 0 && (
          <p className="rounded-xl border border-gold/30 bg-gold/10 px-5 py-3 font-ui text-sm text-[#7a5e1f]">
            {result.failures.length} document(s) could not be read and were skipped — the rest of the
            batch was analyzed without interruption.
          </p>
        )}
        <div className="flex items-center justify-between">
          <div>
            <Eyebrow>The findings book</Eyebrow>
            <h2 className="mt-2 font-display text-3xl text-forest">
              Ranked by what you can claw back
            </h2>
          </div>
          <div className="flex items-center gap-4">
            <Link href="/documents" className="font-ui text-sm text-ink-soft underline decoration-gold/60 underline-offset-4 hover:text-ink">
              Browse source documents
            </Link>
            <Button onClick={reset} variant="ghost" arrow={false}>
              Start over
            </Button>
          </div>
        </div>
        <FindingsBook result={result} />
      </div>
    );
  }

  if (status === "loading") {
    return (
      <div className="rounded-3xl border border-ink/10 bg-bone/40 px-8 py-20 text-center">
        <div className="mx-auto h-10 w-10 animate-spin rounded-full border-2 border-forest/20 border-t-forest" />
        <p className="mt-8 font-display text-2xl text-forest">Reading the portfolio…</p>
        <ul className="mx-auto mt-6 max-w-md space-y-2">
          {STEPS.map((s) => (
            <li key={s} className="font-body text-sm text-ink-soft">
              {s}
            </li>
          ))}
        </ul>
      </div>
    );
  }

  return (
    <div className="grid gap-6 md:grid-cols-2">
      {/* Sample */}
      <div className="flex flex-col rounded-3xl border border-ink/10 bg-paper p-8">
        <Eyebrow>Fastest</Eyebrow>
        <h2 className="mt-3 font-display text-3xl text-forest">Use the sample portfolio</h2>
        <p className="mt-3 flex-1 font-body text-ink-soft">
          A mid-size logistics company — 22 vendors, 302 real-looking contracts and twelve months of
          invoices across PDF, Excel and Word. Findings appear immediately.
        </p>
        <div className="mt-6">
          <Button onClick={loadSample} variant="forest">
            Analyze the sample
          </Button>
        </div>
      </div>

      {/* Upload */}
      <div className="flex flex-col rounded-3xl border border-ink/10 bg-paper p-8">
        <Eyebrow>Your data</Eyebrow>
        <h2 className="mt-3 font-display text-3xl text-forest">Upload your own</h2>
        <p className="mt-3 font-body text-ink-soft">
          Drop in your vendor contracts and 12+ months of invoices (PDF, Excel, Word). They're parsed
          in-memory and never leave the request.
        </p>
        <label
          className={clsx(
            "mt-5 flex cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed border-ink/25 bg-bone/40 px-4 py-8 text-center transition-colors hover:border-forest/40",
          )}
        >
          <input
            ref={inputRef}
            type="file"
            multiple
            accept=".pdf,.xlsx,.xls,.docx,.doc"
            className="hidden"
            onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
          />
          <span className="font-ui text-sm text-ink-soft">
            {files.length > 0
              ? `${files.length} file${files.length > 1 ? "s" : ""} selected`
              : "Click to choose files"}
          </span>
        </label>
        <div className="mt-5">
          <Button onClick={analyzeUpload} variant="forest" className={files.length === 0 ? "opacity-40 pointer-events-none" : ""}>
            Find my savings
          </Button>
        </div>
      </div>

      {status === "error" && (
        <p className="md:col-span-2 rounded-xl border border-terracotta/30 bg-terracotta/10 px-5 py-3 font-ui text-sm text-terracotta">
          {error}
        </p>
      )}
    </div>
  );
}

"use client";

import { useRef, useState } from "react";
import { clsx } from "clsx";
import type { AnalysisResult } from "@/lib/types";
import { Eyebrow } from "@/components/ui/primitives";

/**
 * The "try it on your own data" box shown below every dashboard section. On a
 * successful analysis it hands the result back so the dashboard re-renders in
 * place with the user's own portfolio.
 */
export function UploadCard({
  id,
  onResult,
}: {
  id?: string;
  onResult: (r: AnalysisResult) => void;
}) {
  const [files, setFiles] = useState<File[]>([]);
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function analyze() {
    if (files.length === 0) return;
    setStatus("loading");
    setError(null);
    try {
      const form = new FormData();
      for (const f of files) form.append("files", f);
      const res = await fetch("/api/analyze", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `Analysis failed (${res.status})`);
      setFiles([]);
      if (inputRef.current) inputRef.current.value = "";
      setStatus("idle");
      onResult(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Analysis failed.");
      setStatus("error");
    }
  }

  return (
    <div id={id} className="mt-12 scroll-mt-24 rounded-3xl border border-ink/10 bg-bone/40 p-8">
      <Eyebrow>Your data</Eyebrow>
      <h3 className="mt-3 font-display text-2xl text-forest">Try it on your own contracts</h3>
      <p className="mt-2 max-w-xl font-body text-ink-soft">
        Drop in your vendor contracts and 12+ months of invoices (PDF, Excel, Word). They&apos;re
        parsed in-memory and never leave the request.
      </p>
      <label className="mt-5 flex cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed border-ink/25 bg-paper px-4 py-8 text-center transition-colors hover:border-forest/40">
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
      <div className="mt-5 flex flex-wrap items-center gap-4">
        <button
          onClick={analyze}
          disabled={files.length === 0 || status === "loading"}
          className={clsx(
            "group inline-flex items-center gap-2 rounded-full bg-forest px-6 py-3 font-ui text-sm text-cream transition-all duration-300 hover:bg-pine",
            (files.length === 0 || status === "loading") && "pointer-events-none opacity-40",
          )}
        >
          {status === "loading" ? "Analyzing…" : "Find my savings"}
          <span className="transition-transform duration-300 group-hover:translate-x-1">→</span>
        </button>
        {status === "error" && <span className="font-ui text-sm text-terracotta">{error}</span>}
      </div>
    </div>
  );
}

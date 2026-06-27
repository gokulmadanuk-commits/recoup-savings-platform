"use client";

import { useState } from "react";

export type OutreachTemplate = {
  channel: string;
  name: string;
  subject: string;
  body: string;
};

/**
 * A single outreach template rendered as an editorial card with a
 * copy-to-clipboard control. Copies subject + body together so it can be
 * dropped straight into an email or LinkedIn draft.
 */
export function TemplateCard({ template, index }: { template: OutreachTemplate; index: number }) {
  const [copied, setCopied] = useState<"none" | "all" | "subject">("none");

  function copy(text: string, which: "all" | "subject") {
    navigator.clipboard?.writeText(text);
    setCopied(which);
    setTimeout(() => setCopied("none"), 1500);
  }

  const full = `Subject: ${template.subject}\n\n${template.body}`;

  return (
    <div className="flex flex-col rounded-2xl border border-ink/10 bg-paper p-6 transition-all duration-300 hover:border-ink/20 hover:shadow-[0_8px_30px_rgba(31,58,46,0.06)]">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-baseline gap-3">
          <span className="font-display text-base tabular-nums text-gold/80">
            {String(index + 1).padStart(2, "0")}
          </span>
          <div>
            <span className="inline-flex items-center rounded-full bg-sand/50 px-2.5 py-0.5 font-ui text-[11px] uppercase tracking-[0.1em] text-ink-soft">
              {template.channel}
            </span>
            <h3 className="mt-2 font-display text-xl leading-snug text-forest">{template.name}</h3>
          </div>
        </div>
        <button
          onClick={() => copy(full, "all")}
          className="shrink-0 rounded-full border border-ink/15 px-4 py-2 font-ui text-sm text-ink-soft transition-colors hover:text-ink"
        >
          {copied === "all" ? "Copied ✓" : "Copy"}
        </button>
      </div>

      <div className="mt-5 border-t border-gold/30 pt-4">
        <div className="flex items-center justify-between gap-3">
          <span className="font-ui text-[11px] uppercase tracking-[0.12em] text-ink-soft">
            Subject
          </span>
          <button
            onClick={() => copy(template.subject, "subject")}
            className="font-ui text-xs text-emerald underline decoration-gold/50 underline-offset-4 hover:text-forest"
          >
            {copied === "subject" ? "Copied ✓" : "Copy subject"}
          </button>
        </div>
        <p className="mt-1 font-body text-base text-ink">{template.subject}</p>
      </div>

      <pre className="mt-4 flex-1 whitespace-pre-wrap rounded-lg bg-bone/50 p-4 font-body text-sm leading-relaxed text-ink">
        {template.body}
      </pre>
    </div>
  );
}

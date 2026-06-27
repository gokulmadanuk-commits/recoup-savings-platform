"use client";

import { useState } from "react";
import { clsx } from "clsx";
import type { EmailDraft, Finding } from "@/lib/types";
import { gmailComposeUrl, mailtoUrl } from "@/lib/gmail";
import { formatUSD } from "@/lib/money";
import { VendorMark } from "./mark";

function GoogleGlyph({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden className="shrink-0">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => {
        navigator.clipboard?.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
      className="inline-flex items-center rounded-full border border-ink/15 px-4 py-2 font-ui text-sm text-ink-soft hover:text-ink"
    >
      {copied ? "Copied ✓" : "Copy"}
    </button>
  );
}

export function EmailQueue({ drafts, findings }: { drafts: EmailDraft[]; findings: Finding[] }) {
  const [connected, setConnected] = useState(false);
  const byId = new Map(findings.map((f) => [f.id, f]));

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-ink/10 bg-paper p-5">
        <div className="flex items-center gap-3">
          <GoogleGlyph size={26} />
          <div>
            <div className="font-body text-ink">{connected ? "Gmail connected" : "Connect Gmail"}</div>
            <div className="font-ui text-xs text-ink-soft">
              {connected
                ? "jordan.avery@northwindlogistics.com · drafts open ready to review and send"
                : "Get these vendor emails drafted straight into your inbox, ready to send."}
            </div>
          </div>
        </div>
        {connected ? (
          <span className="rounded-full bg-verdant/15 px-3 py-1.5 font-ui text-xs text-verdant">Connected ✓</span>
        ) : (
          <button
            onClick={() => setConnected(true)}
            className="inline-flex items-center gap-2.5 rounded-full border border-ink/15 bg-white px-5 py-2.5 font-ui text-sm text-ink shadow-sm transition-colors hover:bg-ink/[0.03]"
          >
            <GoogleGlyph size={16} /> Sign in with Google
          </button>
        )}
      </div>

      <div className="mt-4 space-y-3">
        {drafts.map((d, i) => {
          const f = byId.get(d.findingId);
          return (
            <div key={d.findingId} className="rounded-2xl border border-ink/10 bg-paper p-5">
              <div className="flex items-start gap-3">
                <span className="font-display text-base tabular-nums text-gold/80">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <VendorMark name={d.vendorName} size={22} />
                    <span className="font-ui text-xs uppercase tracking-wide text-ink-soft">{d.vendorName}</span>
                    {f && <span className="font-ui text-xs tabular-nums text-verdant">{formatUSD(f.annualizedSavingsCents)}</span>}
                  </div>
                  <div className="mt-1.5 font-display text-base leading-snug text-forest">{d.subject}</div>
                  <div className="font-ui text-xs text-ink-soft">To: {d.to}</div>

                  <details className="mt-3">
                    <summary className="cursor-pointer font-ui text-xs text-emerald">Preview email</summary>
                    <pre className="mt-2 whitespace-pre-wrap rounded-lg bg-bone/50 p-4 font-body text-sm leading-relaxed text-ink">
                      {d.body}
                    </pre>
                  </details>

                  <div className="mt-3 flex flex-wrap gap-2">
                    <a
                      href={gmailComposeUrl(d)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={clsx(
                        "group inline-flex items-center gap-2 rounded-full px-4 py-2 font-ui text-sm transition-colors",
                        connected ? "bg-forest text-cream hover:bg-pine" : "bg-ink/5 text-ink hover:bg-ink/10",
                      )}
                    >
                      <GoogleGlyph size={14} />
                      {connected ? "Create draft in Gmail" : "Open in Gmail"}
                      <span className="transition-transform group-hover:translate-x-0.5">→</span>
                    </a>
                    <a href={mailtoUrl(d)} className="inline-flex items-center rounded-full border border-ink/15 px-4 py-2 font-ui text-sm text-ink-soft hover:text-ink">
                      Email client
                    </a>
                    <CopyButton text={`To: ${d.to}\nSubject: ${d.subject}\n\n${d.body}`} />
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

"use client";

import { useEffect, useMemo, useState } from "react";
import { clsx } from "clsx";
import type { RevenueFinding } from "@/lib/revenue/types";
import type { EmailDraft } from "@/lib/types";
import { gmailComposeUrl } from "@/lib/gmail";
import { formatUSD, formatPct } from "@/lib/money";
import { VendorMark } from "../mark";

/* ------------------------------------------------------------------ */
/* Pipeline stages — the realization system of record (seller-side).   */
/* ------------------------------------------------------------------ */

const STAGES = [
  "Identified",
  "Notice drafted",
  "Issued to customer",
  "In dispute",
  "Agreed",
  "Collected",
  "Won't pursue",
] as const;

type Stage = (typeof STAGES)[number];

const DEFAULT_STAGE: Stage = "Identified";
const COLLECTED: Stage = "Collected";
const STORAGE_KEY = "recoup:revenue-tracker:v1";

/** Per-stage accent dot (forest spectrum; terracotta for the dropped lane). */
const STAGE_DOT: Record<Stage, string> = {
  Identified: "bg-ink/25",
  "Notice drafted": "bg-sand",
  "Issued to customer": "bg-gold",
  "In dispute": "bg-emerald",
  Agreed: "bg-verdant",
  Collected: "bg-forest",
  "Won't pursue": "bg-terracotta/60",
};

type StageMap = Record<string, Stage>;

function isStage(v: unknown): v is Stage {
  return typeof v === "string" && (STAGES as readonly string[]).includes(v);
}

function readStored(): StageMap {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return {};
    const out: StageMap = {};
    for (const [id, stage] of Object.entries(parsed as Record<string, unknown>)) {
      if (isStage(stage)) out[id] = stage;
    }
    return out;
  } catch {
    return {};
  }
}

/* Escape a single CSV cell (RFC-4180: wrap in quotes when needed, double quotes). */
function csvCell(value: string): string {
  if (/[",\n\r]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

/* ------------------------------------------------------------------ */
/* Relationship-risk badge                                             */
/* ------------------------------------------------------------------ */

const RISK_BADGE: Record<
  RevenueFinding["relationshipRisk"],
  { label: string; className: string }
> = {
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

function RiskBadge({ risk }: { risk: RevenueFinding["relationshipRisk"] }) {
  const b = RISK_BADGE[risk];
  return (
    <span
      className={clsx(
        "inline-flex items-center rounded-full px-2 py-0.5 font-ui text-[10px] uppercase tracking-wide",
        b.className,
      )}
    >
      {b.label}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Headline tile                                                       */
/* ------------------------------------------------------------------ */

function Tile({
  value,
  label,
  tone = "forest",
}: {
  value: string;
  label: string;
  tone?: "forest" | "verdant";
}) {
  return (
    <div className="rounded-2xl border border-ink/10 bg-paper p-5">
      <div
        className={clsx(
          "font-display text-3xl tabular-nums md:text-4xl",
          tone === "verdant" ? "text-verdant" : "text-forest",
        )}
      >
        {value}
      </div>
      <div className="mt-3 border-t border-gold/50 pt-2">
        <span className="font-ui text-xs uppercase tracking-[0.12em] text-ink-soft">
          {label}
        </span>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Realization Tracker                                                 */
/* ------------------------------------------------------------------ */

export function RealizationTracker({
  findings,
  drafts,
}: {
  findings: RevenueFinding[];
  drafts: EmailDraft[];
}) {
  const [stages, setStages] = useState<StageMap>({});
  const [hydrated, setHydrated] = useState(false);

  // Read persisted board on mount.
  useEffect(() => {
    setStages(readStored());
    setHydrated(true);
  }, []);

  // Persist on every change (after the initial read).
  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(stages));
    } catch {
      /* storage may be unavailable (private mode); board stays in-memory. */
    }
  }, [stages, hydrated]);

  const draftById = useMemo(
    () => new Map(drafts.map((d) => [d.findingId, d])),
    [drafts],
  );

  const stageOf = (id: string): Stage => stages[id] ?? DEFAULT_STAGE;

  function setStage(id: string, next: Stage) {
    setStages((prev) => ({ ...prev, [id]: next }));
  }

  function reset() {
    setStages({});
  }

  // Group findings by their current stage (in canonical order).
  const grouped = useMemo(() => {
    const map = new Map<Stage, RevenueFinding[]>(STAGES.map((s) => [s, []]));
    for (const f of findings) map.get(stageOf(f.id))!.push(f);
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [findings, stages]);

  const sumFor = (list: RevenueFinding[]) =>
    list.reduce((a, f) => a + f.totalRecoverableCents, 0);

  const identifiedCents = useMemo(
    () => findings.reduce((a, f) => a + f.totalRecoverableCents, 0),
    [findings],
  );
  const realizedCents = sumFor(grouped.get(COLLECTED)!);
  const realizationRate = identifiedCents > 0 ? realizedCents / identifiedCents : 0;

  function exportCsv() {
    const header = ["findingId", "customer", "rule", "amountUSD", "stage"];
    const rows = findings.map((f) => [
      f.id,
      f.customerName,
      f.ruleId,
      (f.totalRecoverableCents / 100).toFixed(2),
      stageOf(f.id),
    ]);
    const csv = [header, ...rows]
      .map((r) => r.map((c) => csvCell(String(c))).join(","))
      .join("\r\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "recoup-realization-board.csv";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  return (
    <div>
      {/* Headline tiles */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Tile value={formatUSD(identifiedCents)} label="Identified" />
        <Tile
          value={formatUSD(realizedCents)}
          label="Realized — collected"
          tone="verdant"
        />
        <Tile
          value={formatPct(realizationRate, 1)}
          label="Realization rate"
          tone="verdant"
        />
      </div>

      {/* Toolbar */}
      <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-xl font-body text-sm text-ink-soft">
          The system of record. Move each finding as the claim progresses —
          only what reaches <span className="text-forest">Collected</span>{" "}
          counts as realized.
        </p>
        <div className="flex shrink-0 items-center gap-2">
          <button
            onClick={exportCsv}
            className="inline-flex items-center rounded-full border border-ink/15 px-4 py-2 font-ui text-sm text-ink-soft transition-colors hover:text-ink"
          >
            Export CSV
          </button>
          <button
            onClick={reset}
            className="inline-flex items-center rounded-full border border-ink/15 px-4 py-2 font-ui text-sm text-ink-soft transition-colors hover:text-ink"
          >
            Reset board
          </button>
        </div>
      </div>

      {/* Scroll hint */}
      <div className="mt-5 flex items-center gap-2 font-ui text-xs text-ink-soft/80">
        <span>{STAGES.length} stages</span>
        <span className="text-gold/70">·</span>
        <span>scroll across to see them all</span>
        <span aria-hidden>→</span>
      </div>
      {/* Board — horizontally scrolling columns */}
      <div className="relative mt-2">
        <div className="overflow-x-auto pb-2">
          <div className="flex min-w-max gap-4">
          {STAGES.map((stage) => {
            const list = grouped.get(stage)!;
            const dropped = stage === "Won't pursue";
            return (
              <section
                key={stage}
                className={clsx(
                  "flex w-72 shrink-0 flex-col rounded-2xl border bg-paper",
                  dropped ? "border-terracotta/20" : "border-ink/10",
                )}
              >
                {/* Column header */}
                <header className="border-b border-gold/40 px-4 py-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span
                        className={clsx("h-2 w-2 rounded-full", STAGE_DOT[stage])}
                        aria-hidden
                      />
                      <span className="font-ui text-xs font-semibold uppercase tracking-[0.1em] text-ink">
                        {stage}
                      </span>
                    </div>
                    <span className="font-ui text-xs tabular-nums text-ink-soft">
                      {list.length}
                    </span>
                  </div>
                  <div
                    className={clsx(
                      "mt-1 font-display text-lg tabular-nums",
                      stage === COLLECTED ? "text-verdant" : "text-forest",
                    )}
                  >
                    {formatUSD(sumFor(list))}
                  </div>
                </header>

                {/* Cards */}
                <div className="flex flex-1 flex-col gap-3 p-3">
                  {list.length === 0 && (
                    <p className="px-1 py-6 text-center font-ui text-xs text-ink-soft/70">
                      No findings
                    </p>
                  )}
                  {list.map((f) => {
                    const draft = draftById.get(f.id);
                    return (
                      <article
                        key={f.id}
                        className="rounded-xl border border-ink/10 bg-bone/40 p-3"
                      >
                        <div className="flex items-center gap-2">
                          <VendorMark
                            name={f.customerName}
                            category={f.category}
                            size={22}
                          />
                          <span className="min-w-0 flex-1 truncate font-ui text-xs uppercase tracking-wide text-ink-soft">
                            {f.customerName}
                          </span>
                          <span className="font-ui text-xs tabular-nums text-verdant">
                            {formatUSD(f.totalRecoverableCents)}
                          </span>
                        </div>

                        <div className="mt-1.5 font-display text-sm leading-snug text-forest">
                          {f.title}
                        </div>

                        <div className="mt-1 flex items-center justify-between gap-2">
                          <span className="font-ui text-[11px] uppercase tracking-wide text-ink-soft/80">
                            {f.ruleId}
                          </span>
                          <RiskBadge risk={f.relationshipRisk} />
                        </div>

                        <div className="mt-2.5 flex items-center gap-2">
                          <select
                            value={stageOf(f.id)}
                            onChange={(e) =>
                              setStage(f.id, e.target.value as Stage)
                            }
                            aria-label={`Move ${f.customerName} finding`}
                            className="min-w-0 flex-1 rounded-lg border border-ink/15 bg-paper px-2 py-1.5 font-ui text-xs text-ink focus:border-emerald focus:outline-none"
                          >
                            {STAGES.map((s) => (
                              <option key={s} value={s}>
                                {s}
                              </option>
                            ))}
                          </select>
                          {draft && (
                            <a
                              href={gmailComposeUrl(draft)}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="shrink-0 font-ui text-xs text-emerald underline decoration-gold/50 underline-offset-2 hover:text-verdant"
                            >
                              Open notice
                            </a>
                          )}
                        </div>
                      </article>
                    );
                  })}
                </div>
              </section>
            );
          })}
          </div>
        </div>
        {/* Right-edge fade signals more stages off-screen. */}
        <div
          className="pointer-events-none absolute inset-y-0 right-0 w-12 bg-gradient-to-l from-paper to-transparent md:w-20"
          aria-hidden
        />
      </div>
    </div>
  );
}

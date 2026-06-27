"use client";

import { clsx } from "clsx";
import type { Renewal } from "@/lib/types";
import { formatUSD } from "@/lib/money";
import { formatLong } from "@/lib/dates";
import { VendorMark } from "./mark";

/* ------------------------------------------------------------------ */
/* ICS helper — VEVENT for the notice deadline (all-day) + VALARM.     */
/* ------------------------------------------------------------------ */

/** Fold an ISO "YYYY-MM-DD" into an all-day ICS date value "YYYYMMDD". */
function icsDate(iso: string): string {
  return iso.replace(/-/g, "");
}

/** Escape text per RFC 5545 (commas, semicolons, backslashes, newlines). */
function icsEscape(text: string): string {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\n/g, "\\n");
}

/** Stable, RFC-safe UID for a renewal's deadline event. */
function icsUid(r: Renewal): string {
  return `recoup-${r.vendorId}-${icsDate(r.noticeDeadline)}@recoup`;
}

/** One VEVENT (all-day) anchored on the notice deadline, with a VALARM. */
function vevent(r: Renewal, stamp: string): string {
  const summary = icsEscape(`RECOUP: ${r.vendorName} renewal notice deadline`);
  const description = icsEscape(
    `Contract renews on ${formatLong(r.endDate)} (${r.renewalTermMonths}-month term). ` +
      `Annual value at risk: ${formatUSD(r.annualValueCents)}. ` +
      `Notice window: ${r.noticeWindowDays} days${r.autoRenew ? " — auto-renews if no notice is given." : "."}`,
  );
  return [
    "BEGIN:VEVENT",
    `UID:${icsUid(r)}`,
    `DTSTAMP:${stamp}`,
    `DTSTART;VALUE=DATE:${icsDate(r.noticeDeadline)}`,
    `SUMMARY:${summary}`,
    `DESCRIPTION:${description}`,
    "TRANSP:TRANSPARENT",
    "BEGIN:VALARM",
    "ACTION:DISPLAY",
    `DESCRIPTION:${summary}`,
    "TRIGGER:-P7D",
    "END:VALARM",
    "END:VEVENT",
  ].join("\r\n");
}

/** Wrap one or more renewals into a complete VCALENDAR document. */
function buildIcs(renewals: Renewal[]): string {
  const stamp = new Date()
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}Z$/, "Z");
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//RECOUP//Renewal Calendar//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    ...renewals.map((r) => vevent(r, stamp)),
    "END:VCALENDAR",
  ].join("\r\n");
}

function downloadIcs(filename: string, renewals: Renewal[]) {
  const blob = new Blob([buildIcs(renewals)], {
    type: "text/calendar;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

/* ------------------------------------------------------------------ */
/* Urgency bands                                                       */
/* ------------------------------------------------------------------ */

type BandKey = "passed" | "now" | "soon" | "later";

const BANDS: {
  key: BandKey;
  label: string;
  /** dot + accent text colour */
  dot: string;
  text: string;
  border: string;
  match: (days: number) => boolean;
}[] = [
  {
    key: "passed",
    label: "Deadline passed",
    dot: "bg-terracotta",
    text: "text-terracotta",
    border: "border-l-terracotta",
    match: (d) => d <= 0,
  },
  {
    key: "now",
    label: "Act now — within 30 days",
    dot: "bg-gold",
    text: "text-gold",
    border: "border-l-gold",
    match: (d) => d > 0 && d <= 30,
  },
  {
    key: "soon",
    label: "Within 90 days",
    dot: "bg-emerald",
    text: "text-emerald",
    border: "border-l-emerald",
    match: (d) => d > 30 && d <= 90,
  },
  {
    key: "later",
    label: "Later",
    dot: "bg-ink-soft",
    text: "text-ink-soft",
    border: "border-l-ink/30",
    match: (d) => d > 90,
  },
];

function deadlineFraming(days: number): string {
  if (days < 0) return `${Math.abs(days)} days ago`;
  if (days === 0) return "today";
  if (days === 1) return "tomorrow";
  return `in ${days} days`;
}

/* ------------------------------------------------------------------ */
/* Component                                                           */
/* ------------------------------------------------------------------ */

export function RenewalCalendar({ renewals }: { renewals: Renewal[] }) {
  const sorted = [...renewals].sort((a, b) => a.daysToDeadline - b.daysToDeadline);

  const next90 = sorted.filter((r) => r.daysToDeadline <= 90 && r.daysToDeadline > 0);
  const next90ValueCents = next90.reduce((sum, r) => sum + r.annualValueCents, 0);
  const passedCount = sorted.filter((r) => r.daysToDeadline <= 0).length;

  const grouped = BANDS.map((band) => ({
    band,
    items: sorted.filter((r) => band.match(r.daysToDeadline)),
  })).filter((g) => g.items.length > 0);

  return (
    <div>
      {/* Summary tiles */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Tile
          value={String(next90.length)}
          label="Renewals · next 90 days"
          tone="ink"
        />
        <Tile
          value={formatUSD(next90ValueCents)}
          label="Annual value at risk · 90 days"
          tone="gold"
        />
        <Tile
          value={String(passedCount)}
          label="Notice deadline passed"
          tone={passedCount > 0 ? "terracotta" : "ink"}
        />
      </div>

      {/* Add-all action */}
      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
        <p className="font-ui text-xs uppercase tracking-[0.1em] text-ink-soft">
          {sorted.length} contract{sorted.length === 1 ? "" : "s"} on watch
        </p>
        {sorted.length > 0 && (
          <button
            onClick={() => downloadIcs("recoup-renewals.ics", sorted)}
            className="group inline-flex items-center gap-2 rounded-full border border-ink/15 px-4 py-2 font-ui text-sm text-ink-soft transition-colors hover:text-ink"
          >
            Add all to calendar
            <span className="transition-transform group-hover:translate-x-0.5">↓</span>
          </button>
        )}
      </div>

      {/* Bands */}
      <div className="mt-6 space-y-8">
        {grouped.map(({ band, items }) => (
          <section key={band.key}>
            <div className="mb-3 flex items-center gap-2.5">
              <span className={clsx("h-2 w-2 rounded-full", band.dot)} />
              <h3 className={clsx("font-ui text-xs font-semibold uppercase tracking-[0.12em]", band.text)}>
                {band.label}
              </h3>
              <span className="font-ui text-xs tabular-nums text-ink-soft">({items.length})</span>
            </div>

            <div className="space-y-3">
              {items.map((r) => (
                <RenewalRow key={r.vendorId} renewal={r} band={band} />
              ))}
            </div>
          </section>
        ))}

        {grouped.length === 0 && (
          <div className="rounded-2xl border border-ink/10 bg-paper p-8 text-center">
            <p className="font-body text-ink-soft">No upcoming renewals on watch.</p>
          </div>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Tile                                                                */
/* ------------------------------------------------------------------ */

function Tile({
  value,
  label,
  tone,
}: {
  value: string;
  label: string;
  tone: "ink" | "gold" | "terracotta";
}) {
  const valueColor =
    tone === "terracotta"
      ? "text-terracotta"
      : tone === "gold"
        ? "text-gold"
        : "text-forest";
  return (
    <div className="rounded-2xl border border-ink/10 bg-paper p-5">
      <div className={clsx("font-display text-3xl tabular-nums md:text-4xl", valueColor)}>
        {value}
      </div>
      <div className="mt-3 border-t border-gold/50 pt-2">
        <span className="font-ui text-[11px] uppercase tracking-[0.12em] text-ink-soft">
          {label}
        </span>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Renewal row                                                         */
/* ------------------------------------------------------------------ */

function RenewalRow({
  renewal: r,
  band,
}: {
  renewal: Renewal;
  band: (typeof BANDS)[number];
}) {
  return (
    <div
      className={clsx(
        "rounded-2xl border border-ink/10 border-l-2 bg-paper p-5 transition-all duration-300",
        "hover:-translate-y-0.5 hover:border-ink/20 hover:shadow-[0_8px_30px_rgba(31,58,46,0.06)]",
        band.border,
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        {/* Vendor identity */}
        <div className="flex min-w-0 items-center gap-3">
          <VendorMark name={r.vendorName} category={r.category} size={36} />
          <div className="min-w-0">
            <div className="font-body text-ink">{r.vendorName}</div>
            <div className="font-ui text-xs text-ink-soft">{r.category}</div>
          </div>
        </div>

        {/* Annual value */}
        <div className="text-right">
          <div className="font-ui text-sm tabular-nums text-forest">
            {formatUSD(r.annualValueCents)}
          </div>
          <div className="font-ui text-[11px] uppercase tracking-wide text-ink-soft">
            annual value
          </div>
        </div>
      </div>

      {/* Dates + deadline framing */}
      <div className="mt-4 grid grid-cols-1 gap-4 border-t border-ink/5 pt-4 sm:grid-cols-2">
        <div>
          <div className="font-ui text-[11px] uppercase tracking-[0.1em] text-ink-soft">
            Renews on
          </div>
          <div className="mt-0.5 font-body text-sm text-ink">
            {formatLong(r.endDate)}
          </div>
          <div className="mt-0.5 flex items-center gap-2">
            {r.autoRenew ? (
              <span className="inline-flex items-center rounded-full bg-terracotta/10 px-2.5 py-0.5 font-ui text-[11px] tracking-wide text-terracotta">
                Auto-renews
              </span>
            ) : (
              <span className="inline-flex items-center rounded-full bg-sand/50 px-2.5 py-0.5 font-ui text-[11px] tracking-wide text-ink-soft">
                Manual renewal
              </span>
            )}
            <span className="font-ui text-[11px] text-ink-soft tabular-nums">
              {r.renewalTermMonths}-mo term
            </span>
          </div>
        </div>

        <div>
          <div className="font-ui text-[11px] uppercase tracking-[0.1em] text-ink-soft">
            Act by — notice deadline
          </div>
          <div className={clsx("mt-0.5 font-body text-sm", band.text)}>
            {formatLong(r.noticeDeadline)}
          </div>
          <div className="mt-0.5 font-ui text-[11px] tabular-nums text-ink-soft">
            {r.daysToDeadline <= 0 ? "Passed " : ""}
            {deadlineFraming(r.daysToDeadline)} · {r.noticeWindowDays}-day window
          </div>
        </div>
      </div>

      {/* Add to calendar */}
      <div className="mt-4 flex justify-end">
        <button
          onClick={() =>
            downloadIcs(`recoup-${slug(r.vendorName)}-renewal.ics`, [r])
          }
          className="group inline-flex items-center gap-2 rounded-full border border-ink/15 px-4 py-2 font-ui text-sm text-ink-soft transition-colors hover:text-ink"
        >
          Add to calendar
          <span className="transition-transform group-hover:translate-x-0.5">↓</span>
        </button>
      </div>
    </div>
  );
}

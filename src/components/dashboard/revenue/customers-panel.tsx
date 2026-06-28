"use client";

import { useState } from "react";
import { formatUSD } from "@/lib/money";
import type { CustomerSummary } from "@/lib/revenue/types";
import { VendorMark } from "../mark";

export function CustomersPanel({ customers }: { customers: CustomerSummary[] }) {
  const [all, setAll] = useState(false);
  const ranked = [...customers].sort(
    (a, b) => b.recoverableCents - a.recoverableCents,
  );
  const withFindings = ranked.filter((c) => c.findingCount > 0).length;
  const shown = all ? ranked : ranked.slice(0, 8);
  const max = Math.max(1, ...ranked.map((c) => c.recoverableCents));

  return (
    <div>
      <div className="overflow-hidden rounded-2xl border border-ink/10">
        <table className="w-full text-left">
          <thead>
            <tr className="border-b border-gold/40 bg-bone/50 font-ui text-[11px] uppercase tracking-[0.1em] text-ink-soft">
              <th className="px-5 py-3 font-semibold">Customer</th>
              <th className="hidden px-5 py-3 text-right font-semibold sm:table-cell">
                Revenue under mgmt
              </th>
              <th className="px-5 py-3 text-right font-semibold">Recoverable</th>
              <th className="hidden px-5 py-3 text-right font-semibold md:table-cell">
                Arrears / Uplift
              </th>
              <th className="hidden px-5 py-3 text-right font-semibold lg:table-cell">
                Open AR
              </th>
              <th className="hidden px-5 py-3 text-right font-semibold sm:table-cell">
                Findings
              </th>
            </tr>
          </thead>
          <tbody>
            {shown.map((c) => {
              const clean = c.findingCount === 0;
              return (
                <tr
                  key={c.id}
                  className="border-b border-ink/5 last:border-0 hover:bg-bone/30"
                >
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-3">
                      <div className={clean ? "opacity-50" : undefined}>
                        <VendorMark name={c.name} category={c.segment} size={32} />
                      </div>
                      <div>
                        <div
                          className={
                            clean ? "font-body text-ink-soft" : "font-body text-ink"
                          }
                        >
                          {c.name}
                        </div>
                        <div className="font-ui text-xs text-ink-soft">
                          {c.segment}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="hidden px-5 py-3 text-right font-ui text-sm tabular-nums text-ink-soft sm:table-cell">
                    {formatUSD(c.annualRevenueCents)}
                  </td>
                  <td className="px-5 py-3 text-right">
                    <div
                      className={
                        clean
                          ? "font-ui text-sm tabular-nums text-ink-soft/60"
                          : "font-ui text-sm tabular-nums text-verdant"
                      }
                    >
                      {formatUSD(c.recoverableCents)}
                    </div>
                    <div className="mt-1.5 ml-auto h-1.5 w-full max-w-[120px] overflow-hidden rounded-full bg-ink/5">
                      <div
                        className="h-full rounded-full bg-verdant/70 transition-all duration-700"
                        style={{
                          width: `${(c.recoverableCents / max) * 100}%`,
                        }}
                      />
                    </div>
                  </td>
                  <td className="hidden px-5 py-3 text-right font-ui text-xs tabular-nums text-ink-soft md:table-cell">
                    <span className="text-terracotta">
                      {formatUSD(c.arrearsCents)}
                    </span>
                    <span className="text-ink/30"> / </span>
                    <span className="text-emerald">
                      {formatUSD(c.upliftCents)}
                    </span>
                  </td>
                  <td className="hidden px-5 py-3 text-right font-ui text-sm tabular-nums text-ink-soft lg:table-cell">
                    {formatUSD(c.openARCents)}
                  </td>
                  <td className="hidden px-5 py-3 text-right font-ui text-sm tabular-nums text-ink-soft sm:table-cell">
                    {clean ? (
                      <span className="text-ink-soft/50">—</span>
                    ) : (
                      c.findingCount
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {ranked.length > 8 && (
        <button
          onClick={() => setAll(!all)}
          className="mt-4 font-ui text-sm text-ink-soft underline decoration-gold/60 underline-offset-4 hover:text-ink"
        >
          {all
            ? "Show top 8"
            : `Show all ${ranked.length} customers (${withFindings} with findings)`}
        </button>
      )}
    </div>
  );
}

"use client";

import { useState } from "react";
import { formatUSD } from "@/lib/money";
import type { VendorSummary } from "@/lib/types";
import { VendorMark } from "./mark";

export function VendorsPanel({ vendors }: { vendors: VendorSummary[] }) {
  const [all, setAll] = useState(false);
  const withSavings = vendors.filter((v) => v.savingsCents > 0);
  const shown = all ? withSavings : withSavings.slice(0, 8);

  return (
    <div>
      <div className="overflow-hidden rounded-2xl border border-ink/10">
        <table className="w-full text-left">
          <thead>
            <tr className="border-b border-gold/40 bg-bone/50 font-ui text-[11px] uppercase tracking-[0.1em] text-ink-soft">
              <th className="px-5 py-3 font-semibold">Vendor</th>
              <th className="hidden px-5 py-3 font-semibold sm:table-cell">Annual spend</th>
              <th className="px-5 py-3 text-right font-semibold">Savings</th>
              <th className="hidden px-5 py-3 text-right font-semibold sm:table-cell">Findings</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((v) => (
              <tr key={v.id} className="border-b border-ink/5 last:border-0 hover:bg-bone/30">
                <td className="px-5 py-3">
                  <div className="flex items-center gap-3">
                    <VendorMark name={v.name} category={v.category} size={32} />
                    <div>
                      <div className="font-body text-ink">{v.name}</div>
                      <div className="font-ui text-xs text-ink-soft">{v.category}</div>
                    </div>
                  </div>
                </td>
                <td className="hidden px-5 py-3 font-ui text-sm tabular-nums text-ink-soft sm:table-cell">
                  {formatUSD(v.annualSpendCents)}
                </td>
                <td className="px-5 py-3 text-right font-ui text-sm tabular-nums text-verdant">
                  {formatUSD(v.savingsCents)}
                </td>
                <td className="hidden px-5 py-3 text-right font-ui text-sm tabular-nums text-ink-soft sm:table-cell">
                  {v.findingCount}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {withSavings.length > 8 && (
        <button
          onClick={() => setAll(!all)}
          className="mt-4 font-ui text-sm text-ink-soft underline decoration-gold/60 underline-offset-4 hover:text-ink"
        >
          {all ? "Show top 8" : `Show all ${withSavings.length} vendors with findings`}
        </button>
      )}
    </div>
  );
}

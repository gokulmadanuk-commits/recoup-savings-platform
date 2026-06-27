"use client";

import type { AnalysisResult } from "@/lib/types";
import { findingsToCsv, downloadText } from "@/lib/export";

/** localStorage handoff key the /report page reads on mount. */
const REPORT_KEY = "recoup:report";

/**
 * Two export actions for the CFO deliverable:
 *  - "Download CSV"  → findings.csv (vendor / rule / savings, ranked by $)
 *  - "Open CFO report" → stashes the result in localStorage and opens the
 *    print-optimized /report page in a new tab.
 */
export function ReportButtons({ result }: { result: AnalysisResult }) {
  function handleCsv() {
    const csv = findingsToCsv(result);
    const customer = result.summary.customer
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
    const name = `recoup-findings${customer ? `-${customer}` : ""}.csv`;
    downloadText(name, csv);
  }

  function handleReport() {
    try {
      localStorage.setItem(REPORT_KEY, JSON.stringify(result));
    } catch {
      /* private mode / quota — the report falls back to /api/sample */
    }
    window.open("/report", "_blank", "noopener,noreferrer");
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <button
        type="button"
        onClick={handleReport}
        className="group inline-flex items-center gap-2 rounded-full bg-forest px-6 py-3 font-ui text-sm tracking-wide text-cream transition-colors duration-300 hover:bg-pine"
      >
        <span>Open CFO report</span>
        <span className="transition-transform duration-300 group-hover:translate-x-1">
          →
        </span>
      </button>
      <button
        type="button"
        onClick={handleCsv}
        className="inline-flex items-center gap-2 rounded-full bg-cream px-6 py-3 font-ui text-sm tracking-wide text-forest transition-all duration-300 hover:bg-white hover:shadow-[0_8px_30px_rgba(22,39,31,0.15)]"
      >
        <span>Download CSV</span>
      </button>
    </div>
  );
}

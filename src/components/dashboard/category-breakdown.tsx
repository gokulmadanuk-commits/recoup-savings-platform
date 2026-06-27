import { formatUSD } from "@/lib/money";
import type { CategorySummary } from "@/lib/types";

const SERIES = [
  "#1F3A2E", "#008168", "#B08D45", "#2E7D5B", "#16271F",
  "#0E7490", "#6D28D9", "#A6492F", "#92400E", "#1E3A8A",
];

export function CategoryBreakdown({ categories }: { categories: CategorySummary[] }) {
  const max = Math.max(1, ...categories.map((c) => c.savingsCents));
  return (
    <div className="space-y-4">
      {categories.map((c, i) => (
        <div key={c.category}>
          <div className="flex items-baseline justify-between font-ui text-sm">
            <span className="text-ink">
              {c.label}
              <span className="text-ink-soft"> · {c.count} finding{c.count === 1 ? "" : "s"}</span>
            </span>
            <span className="tabular-nums text-ink">{formatUSD(c.savingsCents)}</span>
          </div>
          <div className="mt-1.5 h-2.5 w-full overflow-hidden rounded-full bg-ink/5">
            <div
              className="h-full rounded-full transition-all duration-700"
              style={{ width: `${(c.savingsCents / max) * 100}%`, background: SERIES[i % SERIES.length] }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

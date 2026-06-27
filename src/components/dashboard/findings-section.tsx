"use client";

import { useState } from "react";
import { clsx } from "clsx";
import type { AnalysisResult } from "@/lib/types";
import { FindingCard } from "@/components/app/results";

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={clsx(
        "rounded-full px-3.5 py-1.5 font-ui text-xs tracking-wide transition-colors",
        active ? "bg-forest text-cream" : "border border-ink/15 text-ink-soft hover:text-ink",
      )}
    >
      {children}
    </button>
  );
}

export function FindingsSection({ result }: { result: AnalysisResult }) {
  const [cat, setCat] = useState<string | null>(null);
  const draftsById = new Map(result.drafts.map((d) => [d.findingId, d]));
  const rankOf = new Map(result.findings.map((f, i) => [f.id, i + 1]));
  const shown = cat ? result.findings.filter((f) => f.category === cat) : result.findings;

  return (
    <div>
      <div className="mb-5 flex flex-wrap gap-2">
        <Chip active={cat === null} onClick={() => setCat(null)}>
          All · {result.findings.length}
        </Chip>
        {result.categories.map((c) => (
          <Chip key={c.category} active={cat === c.category} onClick={() => setCat(c.category)}>
            {c.label} · {c.count}
          </Chip>
        ))}
      </div>
      <div className="space-y-3">
        {shown.map((f) => (
          <FindingCard key={f.id} finding={f} draft={draftsById.get(f.id)} rank={rankOf.get(f.id) ?? 0} />
        ))}
      </div>
    </div>
  );
}

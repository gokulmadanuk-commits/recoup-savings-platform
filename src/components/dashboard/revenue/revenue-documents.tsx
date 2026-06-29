import type { RevenueDocumentSummary } from "@/lib/revenue/types";
import { VendorMark } from "../mark";

const FORMAT_BADGE: Record<string, string> = {
  pdf: "bg-terracotta/15 text-terracotta",
  excel: "bg-verdant/15 text-verdant",
  word: "bg-emerald/15 text-emerald",
};
const FORMAT_LABEL: Record<string, string> = { pdf: "PDF", excel: "Excel", word: "Word" };

const DOCTYPE_LABEL: Record<string, string> = {
  customer_contract: "Customer contract",
  billing_export: "Billing export",
  ar_aging: "Statement of account",
};

function kb(bytes: number): string {
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

export function RevenueDocuments({ documents }: { documents: RevenueDocumentSummary[] }) {
  const byCustomer = new Map<string, RevenueDocumentSummary[]>();
  for (const d of documents) {
    if (!byCustomer.has(d.customerId)) byCustomer.set(d.customerId, []);
    byCustomer.get(d.customerId)!.push(d);
  }

  return (
    <div className="space-y-3">
      {[...byCustomer.values()].map((docs) => {
        const c = docs[0];
        const contracts = docs.filter((d) => d.docType === "customer_contract").length;
        return (
          <details key={c.customerId} className="group rounded-2xl border border-ink/10 bg-paper p-5 open:bg-bone/30">
            <summary className="flex cursor-pointer list-none items-center justify-between">
              <div className="flex items-center gap-3">
                <VendorMark name={c.customerName} size={32} />
                <div>
                  <div className="font-display text-lg text-forest">{c.customerName}</div>
                  <div className="font-ui text-xs text-ink-soft">
                    {docs.length} documents · {contracts} contract{contracts === 1 ? "" : "s"}
                  </div>
                </div>
              </div>
              <span className="font-ui text-sm text-ink-soft transition-transform group-open:rotate-90">→</span>
            </summary>
            <div className="mt-4 space-y-2.5 border-t border-ink/10 pt-4">
              {docs.map((d) => (
                <div key={d.fileName}>
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-2.5">
                      <span className={`shrink-0 rounded px-2 py-0.5 font-ui text-[10px] font-semibold ${FORMAT_BADGE[d.format] ?? "bg-ink/5 text-ink-soft"}`}>
                        {FORMAT_LABEL[d.format] ?? d.format}
                      </span>
                      <span className="shrink-0 font-ui text-[10px] uppercase tracking-[0.08em] text-ink-soft">
                        {DOCTYPE_LABEL[d.docType] ?? d.docType}
                      </span>
                      {d.path ? (
                        <a href={d.path} download className="truncate font-body text-sm text-ink hover:text-emerald hover:underline">
                          {d.fileName}
                        </a>
                      ) : (
                        <span className="truncate font-body text-sm text-ink">{d.fileName}</span>
                      )}
                    </div>
                    {d.sizeBytes != null && (
                      <span className="shrink-0 font-ui text-xs tabular-nums text-ink-soft">{kb(d.sizeBytes)}</span>
                    )}
                  </div>
                  {d.clauses.length > 0 && (
                    <details className="ml-1 mt-1.5 border-l border-gold/40 pl-3">
                      <summary className="cursor-pointer font-ui text-xs text-emerald">
                        {d.clauses.length} extracted clauses
                      </summary>
                      <div className="mt-2 space-y-2.5">
                        {d.clauses.map((cl, i) => (
                          <div key={i}>
                            <div className="font-ui text-xs font-semibold text-ink">{cl.heading}</div>
                            <p className="font-body text-xs leading-relaxed text-ink-soft">{cl.body}</p>
                          </div>
                        ))}
                      </div>
                    </details>
                  )}
                </div>
              ))}
            </div>
          </details>
        );
      })}
    </div>
  );
}

import type { Metadata } from "next";
import { Nav } from "@/components/site/nav";
import { Footer } from "@/components/site/footer";
import { Container, Eyebrow, Button } from "@/components/ui/primitives";
import manifestJson from "../../../public/seed/manifest.json";

export const metadata: Metadata = {
  title: "Source documents — RECOUP",
};

interface ManifestDoc {
  docType: string;
  format: string;
  fileName: string;
  path: string;
  bytes: number;
}
interface ManifestVendor {
  id: string;
  name: string;
  category: string;
  docs: ManifestDoc[];
}
interface Manifest {
  customer: string;
  fileCount: number;
  byFormat: Record<string, number>;
  vendors: ManifestVendor[];
}

const manifest = manifestJson as Manifest;

const FORMAT_BADGE: Record<string, string> = {
  pdf: "bg-terracotta/15 text-terracotta",
  xlsx: "bg-verdant/15 text-verdant",
  docx: "bg-emerald/15 text-emerald",
};

function kb(bytes: number): string {
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

export default function DocumentsPage() {
  return (
    <main className="min-h-screen bg-paper">
      <div className="relative bg-forest text-cream">
        <Nav tone="dark" />
        <Container className="pb-14 pt-32 md:pt-40">
          <Eyebrow className="text-gold">The sample portfolio</Eyebrow>
          <h1 className="mt-4 font-display text-5xl tracking-tight md:text-6xl">
            Source documents
          </h1>
          <p className="mt-5 max-w-2xl font-body text-lg text-cream/80">
            The {manifest.fileCount} contracts and invoices behind {manifest.customer}&apos;s analysis —
            every one downloadable. {manifest.byFormat.pdf ?? 0} PDF, {manifest.byFormat.xlsx ?? 0} Excel,
            {" "}
            {manifest.byFormat.docx ?? 0} Word.
          </p>
          <div className="mt-8">
            <Button href="/analyze" variant="cream">
              Analyze this portfolio
            </Button>
          </div>
        </Container>
      </div>

      <Container className="py-16 md:py-20">
        <div className="space-y-4">
          {manifest.vendors.map((v) => (
            <details
              key={v.id}
              className="group rounded-2xl border border-ink/10 bg-paper p-6 open:bg-bone/40"
            >
              <summary className="flex cursor-pointer list-none items-center justify-between">
                <div>
                  <h2 className="font-display text-xl text-forest">{v.name}</h2>
                  <p className="font-ui text-xs uppercase tracking-[0.12em] text-ink-soft">
                    {v.category} · {v.docs.length} documents
                  </p>
                </div>
                <span className="font-ui text-sm text-ink-soft transition-transform group-open:rotate-90">
                  →
                </span>
              </summary>
              <ul className="mt-5 divide-y divide-ink/5 border-t border-ink/10">
                {v.docs.map((d) => (
                  <li key={d.path} className="flex items-center justify-between gap-4 py-2.5">
                    <div className="flex items-center gap-3">
                      <span
                        className={`rounded px-2 py-0.5 font-ui text-[10px] font-semibold uppercase ${FORMAT_BADGE[d.format] ?? "bg-ink/5 text-ink-soft"}`}
                      >
                        {d.format}
                      </span>
                      <a
                        href={d.path}
                        download
                        className="font-body text-sm text-ink hover:text-emerald hover:underline"
                      >
                        {d.fileName}
                      </a>
                    </div>
                    <span className="font-ui text-xs tabular-nums text-ink-soft">{kb(d.bytes)}</span>
                  </li>
                ))}
              </ul>
            </details>
          ))}
        </div>
      </Container>

      <Footer />
    </main>
  );
}

import { NextResponse } from "next/server";
import { seedDataset, SEEDS } from "@/lib/seed";
import { vendorRecordToDocModels } from "@/lib/docmodel/to-docmodel";
import { analyzeDataset, clausesFor } from "@/lib/analyze";
import { ALL_RULES } from "@/lib/rules";
import { DocumentSummarySchema } from "@/lib/types";
import manifestJson from "../../../../public/seed/manifest.json";

export const runtime = "nodejs";

interface ManifestDoc {
  docType: "contract" | "invoice" | "usage_export";
  format: "pdf" | "excel" | "word";
  fileName: string;
  path: string;
  bytes: number;
}
interface Manifest {
  vendors: { id: string; name: string; category: string; docs: ManifestDoc[] }[];
}
const manifest = manifestJson as Manifest;

/**
 * The sample portfolio analysis — identical to parsing all generated documents
 * (the parser is lossless) but computed directly from the canonical seed for an
 * instant response. The document index is hydrated from the corpus manifest so
 * the dashboard's source-document + clause viewer has real, downloadable files.
 */
export async function GET() {
  const dataset = seedDataset();
  const processed = SEEDS.reduce(
    (a, s) => a + vendorRecordToDocModels(s.record).length,
    0,
  );
  const base = analyzeDataset(dataset, ALL_RULES, { processed, failed: 0 });

  const documents = manifest.vendors.flatMap((v) =>
    v.docs.map((d) =>
      DocumentSummarySchema.parse({
        vendorId: v.id,
        vendorName: v.name,
        docType: d.docType,
        format: d.format,
        fileName: d.fileName,
        path: d.path,
        sizeBytes: d.bytes,
        clauses: clausesFor(dataset, v.id, d.docType),
      }),
    ),
  );

  return NextResponse.json({ ...base, documents });
}

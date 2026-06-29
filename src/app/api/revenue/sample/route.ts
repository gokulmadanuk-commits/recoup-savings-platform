import { NextResponse } from "next/server";
import { revenueSeedDataset, CUSTOMER_SEEDS } from "@/lib/revenue/seed";
import { customerRecordToDocModels } from "@/lib/revenue/docmodel/to-docmodel";
import { analyzeRevenueDataset, clausesForRevenue } from "@/lib/revenue/analyze";
import { ALL_REVENUE_RULES } from "@/lib/revenue/rules";
import { RevenueDocumentSummarySchema } from "@/lib/revenue/types";
import manifestJson from "../../../../../public/revenue-seed/manifest.json";

export const runtime = "nodejs";

interface ManifestDoc {
  docType: "customer_contract" | "billing_export" | "ar_aging";
  format: "pdf" | "excel" | "word";
  fileName: string;
  path: string;
  bytes: number;
}
interface Manifest {
  customers: { id: string; name: string; segment: string; docs: ManifestDoc[] }[];
}
const manifest = manifestJson as Manifest;

/**
 * The sample REVENUE-LEAKAGE analysis — computed directly from the canonical seed
 * (Northwind as seller) for an instant response, with the source-document index
 * hydrated from the generated corpus manifest so the dashboard's document +
 * clause viewer has real, downloadable files.
 */
export async function GET() {
  const dataset = revenueSeedDataset();
  const processed = CUSTOMER_SEEDS.reduce(
    (a, s) => a + customerRecordToDocModels(s.record).length,
    0,
  );
  const base = analyzeRevenueDataset(dataset, ALL_REVENUE_RULES, {
    processed,
    failed: 0,
  });

  const documents = manifest.customers.flatMap((c) =>
    c.docs.map((d) =>
      RevenueDocumentSummarySchema.parse({
        customerId: c.id,
        customerName: c.name,
        docType: d.docType,
        format: d.format,
        fileName: d.fileName,
        path: d.path,
        sizeBytes: d.bytes,
        clauses: clausesForRevenue(dataset, c.id, d.docType),
      }),
    ),
  );

  return NextResponse.json({ ...base, documents });
}

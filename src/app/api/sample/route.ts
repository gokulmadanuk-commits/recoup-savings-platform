import { NextResponse } from "next/server";
import { seedDataset, SEEDS } from "@/lib/seed";
import { vendorRecordToDocModels } from "@/lib/docmodel/to-docmodel";
import { analyzeDataset } from "@/lib/analyze";
import { ALL_RULES } from "@/lib/rules";

export const runtime = "nodejs";

/**
 * The sample portfolio analysis. Identical to parsing all 302 generated
 * documents (the parser is lossless), but computed directly from the canonical
 * seed for an instant response.
 */
export async function GET() {
  const dataset = seedDataset();
  const processed = SEEDS.reduce(
    (a, s) => a + vendorRecordToDocModels(s.record).length,
    0,
  );
  const result = analyzeDataset(dataset, ALL_RULES, { processed, failed: 0 });
  return NextResponse.json(result);
}

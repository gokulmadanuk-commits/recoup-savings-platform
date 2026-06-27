import { NextRequest, NextResponse } from "next/server";
import { analyzeFiles } from "@/lib/analyze";
import { ALL_RULES } from "@/lib/rules";
import type { InputFile } from "@/lib/parsing";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Live analysis of uploaded documents: parse the batch, cross-reference, run the
 * detection engine, return ranked findings + drafted emails. One bad file is
 * reported, never fatal.
 */
export async function POST(req: NextRequest) {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Expected multipart/form-data upload." }, { status: 400 });
  }

  const customer = (form.get("customer") as string)?.trim() || "Your Company";
  const entries = form.getAll("files").filter((f): f is File => f instanceof File);
  if (entries.length === 0) {
    return NextResponse.json({ error: "No files were uploaded." }, { status: 400 });
  }

  const files: InputFile[] = await Promise.all(
    entries.map(async (f) => ({
      fileName: f.name,
      data: new Uint8Array(await f.arrayBuffer()),
    })),
  );

  try {
    const result = await analyzeFiles(files, ALL_RULES, { customer });
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Analysis failed." },
      { status: 500 },
    );
  }
}

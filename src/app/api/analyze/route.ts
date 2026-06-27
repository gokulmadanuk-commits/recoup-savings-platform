import { NextRequest, NextResponse } from "next/server";
import { analyzeFiles } from "@/lib/analyze";
import { ALL_RULES } from "@/lib/rules";
import type { InputFile } from "@/lib/parsing";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_FILES = 500;
const MAX_FILE_BYTES = 15 * 1024 * 1024; // 15 MB per file
const MAX_TOTAL_BYTES = 80 * 1024 * 1024; // 80 MB per request

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

  // Enforce limits using File.size BEFORE buffering any bytes into memory.
  if (entries.length > MAX_FILES) {
    return NextResponse.json(
      { error: `Too many files (${entries.length}). Limit is ${MAX_FILES} per request.` },
      { status: 413 },
    );
  }
  let totalBytes = 0;
  for (const f of entries) {
    if (f.size > MAX_FILE_BYTES) {
      return NextResponse.json(
        { error: `"${f.name}" is too large (${Math.round(f.size / 1024 / 1024)} MB). Limit is ${MAX_FILE_BYTES / 1024 / 1024} MB per file.` },
        { status: 413 },
      );
    }
    totalBytes += f.size;
  }
  if (totalBytes > MAX_TOTAL_BYTES) {
    return NextResponse.json(
      { error: `Upload too large (${Math.round(totalBytes / 1024 / 1024)} MB). Limit is ${MAX_TOTAL_BYTES / 1024 / 1024} MB per request.` },
      { status: 413 },
    );
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

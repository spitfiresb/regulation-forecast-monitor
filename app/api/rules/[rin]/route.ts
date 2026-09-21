import { NextResponse } from "next/server";
import { rinSchema } from "@/lib/model";
import { getCatalogEntry } from "@/lib/catalog";
import { getSnapshot } from "@/lib/repository";
import { getPrediction } from "@/lib/prediction/repository";
import { currentEvaluation } from "@/lib/prediction/engine";
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ rin: string }> },
) {
  const { rin } = await params;
  if (!rinSchema.safeParse(rin).success)
    return NextResponse.json({ error: "Invalid RIN" }, { status: 400 });
  try {
    const entry = await getCatalogEntry(rin);
    if (!entry)
      return NextResponse.json(
        { error: "This rulemaking is not in the imported catalog." },
        { status: 404 },
      );
    const snapshot = await getSnapshot(entry.id);
    const prediction = await getPrediction(entry.id);
    return NextResponse.json(
      { entry, snapshot, prediction, evaluation: currentEvaluation() },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return NextResponse.json(
      { error: "This rule could not be loaded. Please retry." },
      { status: 503 },
    );
  }
}

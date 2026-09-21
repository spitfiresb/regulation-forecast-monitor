import { NextResponse } from "next/server";
import { rinSchema } from "@/lib/model";
import { getCatalogEntry } from "@/lib/catalog";
import { getSnapshot } from "@/lib/repository";
import { syncRule } from "@/lib/sync";
import { authorizeSync } from "@/lib/request-guard";
import { issuePrediction } from "@/lib/prediction/repository";
import { currentEvaluation } from "@/lib/prediction/engine";
export const runtime = "nodejs";
export const maxDuration = 120;
const attempts = new Map<string, number>();
export async function POST(
  request: Request,
  { params }: { params: Promise<{ rin: string }> },
) {
  if (!authorizeSync(request))
    return NextResponse.json(
      { error: "Refresh must come from this app." },
      { status: 403 },
    );
  const { rin } = await params;
  if (!rinSchema.safeParse(rin).success)
    return NextResponse.json({ error: "Invalid RIN" }, { status: 400 });
  const now = Date.now();
  for (const [key, time] of attempts)
    if (now - time > 60000) attempts.delete(key);
  if (now - (attempts.get(rin) ?? 0) < 30000)
    return NextResponse.json(
      { error: "Please wait 30 seconds before refreshing this rule again." },
      { status: 429, headers: { "Retry-After": "30" } },
    );
  attempts.set(rin, now);
  try {
    const entry = await getCatalogEntry(rin);
    if (!entry)
      return NextResponse.json(
        { error: "This rulemaking is not in the catalog." },
        { status: 404 },
      );
    const previous = await getSnapshot(entry.id);
    const snapshot =
      previous && now - Date.parse(previous.synced_at) < 30000
        ? previous
        : await syncRule({
            id: entry.id,
            rin: entry.rin,
            agency_code: entry.agency_code,
          });
    const prediction = await issuePrediction(entry, snapshot);
    return NextResponse.json(
      { entry, snapshot, prediction, evaluation: currentEvaluation() },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Refresh failed. Previous evidence is retained.",
      },
      { status: 502 },
    );
  }
}

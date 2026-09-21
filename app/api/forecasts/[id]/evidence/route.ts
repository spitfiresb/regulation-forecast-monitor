import { NextResponse } from "next/server";
import { getPredictionById } from "@/lib/prediction/repository";
export async function GET(
  _r: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const issue = await getPredictionById((await params).id);
    return issue
      ? NextResponse.json(issue, { headers: { "Cache-Control": "no-store" } })
      : NextResponse.json({ error: "Forecast not found" }, { status: 404 });
  } catch {
    return NextResponse.json(
      { error: "Evidence could not be loaded" },
      { status: 503 },
    );
  }
}

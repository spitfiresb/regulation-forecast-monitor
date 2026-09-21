import { NextResponse } from "next/server";
import { currentEvaluation } from "@/lib/prediction/engine";
export async function GET(
  _r: Request,
  { params }: { params: Promise<{ version: string }> },
) {
  const report = currentEvaluation();
  return (await params).version === report.version
    ? NextResponse.json(report)
    : NextResponse.json(
        {
          error:
            "Evaluation not found. Historical forecast evidence includes its original report.",
        },
        { status: 404 },
      );
}

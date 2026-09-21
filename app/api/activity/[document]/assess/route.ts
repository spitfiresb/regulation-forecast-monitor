import { NextResponse } from "next/server";
import { documentId } from "@/lib/activity/model";
import { assessActivity } from "@/lib/activity/service";
import { authorizeSync } from "@/lib/request-guard";
export const runtime = "nodejs";
export const maxDuration = 120;
export async function POST(
  request: Request,
  { params }: { params: Promise<{ document: string }> },
) {
  if (!authorizeSync(request))
    return NextResponse.json(
      { error: "Source checks must come from this app." },
      { status: 403 },
    );
  const { document } = await params;
  if (!documentId.safeParse(document).success)
    return NextResponse.json(
      { error: "Invalid document number." },
      { status: 400 },
    );
  try {
    return NextResponse.json(
      await assessActivity(
        document,
        new URL(request.url).searchParams.get("refresh") === "true",
      ),
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return NextResponse.json(
      {
        error:
          e instanceof Error ? e.message : "The history could not be checked.",
      },
      {
        status:
          e instanceof Error && /outside the last six months/.test(e.message)
            ? 410
            : 502,
      },
    );
  }
}

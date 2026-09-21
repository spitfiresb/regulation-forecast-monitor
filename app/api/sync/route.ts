import { NextResponse } from "next/server";
import { syncRule } from "@/lib/sync";
import { authorizeSync } from "@/lib/request-guard";
import { getDashboard } from "@/lib/repository";

export const runtime = "nodejs";
export const maxDuration = 120;
let lastAttempt = 0;
export async function POST(request: Request) {
  if (!authorizeSync(request))
    return NextResponse.json(
      {
        error:
          "Refresh must come from this app or an authenticated server request.",
      },
      { status: 403 },
    );
  const now = Date.now();
  if (now - lastAttempt < 30_000)
    return NextResponse.json(
      { error: "Please wait 30 seconds between refresh attempts." },
      { status: 429, headers: { "Retry-After": "30" } },
    );
  lastAttempt = now;
  // Persisted cooldown also covers separate serverless instances after a successful sync.
  const current = await getDashboard();
  if (
    current.storage !== "snapshot" &&
    now - Date.parse(current.synced_at) < 30_000
  )
    return NextResponse.json({
      data: current,
      message: "Official data was checked recently.",
    });
  try {
    return NextResponse.json(
      { data: await syncRule(), message: "Official data refreshed." },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Refresh failed. The previous data is retained.",
      },
      { status: 502 },
    );
  }
}

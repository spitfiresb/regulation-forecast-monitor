import { NextResponse } from "next/server";
import { z } from "zod";
import { searchActivity } from "@/lib/activity/client";
export const runtime = "nodejs";
const query = z.object({
  q: z.string().trim().max(200).default(""),
  page: z.coerce.number().int().min(1).max(1000).default(1),
});
export async function GET(request: Request) {
  const parsed = query.safeParse(
    Object.fromEntries(new URL(request.url).searchParams),
  );
  if (!parsed.success)
    return NextResponse.json(
      { error: "Invalid activity search." },
      { status: 400 },
    );
  try {
    return NextResponse.json(
      await searchActivity(parsed.data.q, parsed.data.page),
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return NextResponse.json(
      {
        error:
          "Federal Register activity could not be searched. Please retry; no absence of activity is inferred.",
      },
      { status: 502 },
    );
  }
}

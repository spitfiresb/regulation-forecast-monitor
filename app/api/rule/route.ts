import { NextResponse } from "next/server";
import { getDashboard, getSnapshot } from "@/lib/repository";
import { RULE_ID, ruleIdSchema } from "@/lib/model";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const parsed = ruleIdSchema.safeParse(
    new URL(request.url).searchParams.get("id") ?? RULE_ID,
  );
  if (!parsed.success)
    return NextResponse.json({ error: "Invalid rule ID" }, { status: 400 });
  try {
    if (parsed.data !== RULE_ID && !(await getSnapshot(parsed.data)))
      return NextResponse.json(
        { error: "This rule has no verified snapshot yet" },
        { status: 404 },
      );
    return NextResponse.json(await getDashboard(parsed.data), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    return NextResponse.json(
      { error: "Saved rule data could not be loaded" },
      { status: 503 },
    );
  }
}

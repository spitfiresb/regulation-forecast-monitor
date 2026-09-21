import { NextResponse } from "next/server";
import { getDashboard } from "@/lib/repository";
export const dynamic = "force-dynamic";
export async function GET() {
  return NextResponse.json(await getDashboard(), {
    headers: { "Cache-Control": "no-store" },
  });
}

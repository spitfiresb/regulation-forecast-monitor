import { NextResponse } from "next/server";
import { catalogQuerySchema, searchCatalog } from "@/lib/catalog";
export const runtime = "nodejs";
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const input = catalogQuerySchema.safeParse(Object.fromEntries(params));
  if (!input.success)
    return NextResponse.json(
      { error: "Invalid catalog search parameters" },
      { status: 400 },
    );
  try {
    return NextResponse.json(await searchCatalog(input.data), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    return NextResponse.json(
      {
        error:
          "Catalog is unavailable. Import the catalog and verify storage configuration.",
      },
      { status: 503 },
    );
  }
}

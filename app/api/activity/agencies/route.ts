import { NextResponse } from "next/server";
import { z } from "zod";

export async function GET() {
  try {
    const response = await fetch(
      "https://www.federalregister.gov/api/v1/agencies.json",
      {
        next: { revalidate: 86400 },
        signal: AbortSignal.timeout(15000),
      },
    );
    if (!response.ok) throw new Error("Agency lookup failed");
    const agencies = z
      .array(z.object({ id: z.number(), name: z.string() }))
      .parse(await response.json());
    return NextResponse.json(
      agencies.sort((a, b) => a.name.localeCompare(b.name)),
    );
  } catch {
    return NextResponse.json(
      { error: "Agency options are unavailable." },
      { status: 502 },
    );
  }
}

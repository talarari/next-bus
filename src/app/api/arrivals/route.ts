import { NextResponse } from "next/server";
import { getArrivals } from "@/lib/transit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const code = Number(searchParams.get("code"));
  if (!Number.isFinite(code)) {
    return NextResponse.json(
      { error: "code query param (stop code) is required" },
      { status: 400 }
    );
  }

  try {
    const result = await getArrivals(code);
    return NextResponse.json(result);
  } catch (err) {
    console.error("arrivals error:", err);
    return NextResponse.json(
      { error: "failed to fetch arrivals" },
      { status: 502 }
    );
  }
}

import { NextResponse } from "next/server";
import { findNearbyStops } from "@/lib/stops";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const lat = Number(searchParams.get("lat"));
  const lon = Number(searchParams.get("lon"));
  const limit = Number(searchParams.get("limit") ?? "5");

  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return NextResponse.json(
      { error: "lat and lon query params are required" },
      { status: 400 }
    );
  }

  const stops = findNearbyStops(lat, lon, Math.min(Math.max(limit, 1), 20));
  return NextResponse.json({ stops });
}

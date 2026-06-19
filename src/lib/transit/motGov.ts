import type { Arrival } from "./types";

/**
 * Real-time arrivals from the Ministry of Transport's public passenger API
 * (the backend of https://bus.gov.il). No API key or registration required —
 * this is the same open endpoint the official journey planner uses.
 *
 * Stop codes here are the standard GTFS stop codes, so the bundled stops
 * dataset feeds straight into it.
 */
const BASE = "https://bus.gov.il/WebApi/api/passengerinfo";

interface MotLine {
  Shilut: string | null;
  CompanyName: string | null;
  Description: string | null;
  MinutesToArrival: number | null;
  MinutesToArrivalList: number[] | null;
}

/** "origin - destination" → "destination". */
function destinationFromDescription(desc: string | null): string {
  if (!desc) return "";
  const parts = desc.split(" - ");
  return (parts[parts.length - 1] ?? desc).trim();
}

export async function getMotGovArrivals(stopCode: number): Promise<Arrival[]> {
  const url = `${BASE}/GetRealtimeBusLineListByBustop/${stopCode}/he/false`;
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0", Accept: "application/json" },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`bus.gov.il HTTP ${res.status}`);
  const rows = (await res.json()) as MotLine[] | null;
  if (!rows) return [];

  const now = Date.now();
  const arrivals: Arrival[] = [];
  for (const r of rows) {
    const mins =
      r.MinutesToArrivalList && r.MinutesToArrivalList.length > 0
        ? r.MinutesToArrivalList
        : r.MinutesToArrival != null
          ? [r.MinutesToArrival]
          : [];
    const line = (r.Shilut ?? "").trim();
    const destination = destinationFromDescription(r.Description);
    const agency = (r.CompanyName ?? "").trim();
    for (const m of mins) {
      arrivals.push({
        line,
        destination,
        agency,
        arrivalTime: new Date(now + m * 60_000).toISOString(),
        minutesAway: m,
        live: true,
      });
    }
  }
  return arrivals.sort((a, b) => a.minutesAway - b.minutesAway);
}

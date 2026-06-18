import type { Arrival } from "./types";

const API = "https://open-bus-stride-api.hasadna.org.il";

interface RideStop {
  arrival_time: string;
  gtfs_route__route_short_name: string | null;
  gtfs_route__route_long_name: string | null;
  gtfs_route__agency_name: string | null;
}

/** Destination is the part after "<->" in the GTFS long name, cleaned up. */
function destinationFromLongName(longName: string | null): string {
  if (!longName) return "";
  const parts = longName.split("<->");
  const tail = (parts[1] ?? parts[0]).trim();
  // Drop trailing direction/alternative markers like "-20", "-2#".
  return tail.replace(/-\d+#?$/, "").trim();
}

/**
 * Published-schedule arrivals at a stop from the open Open Bus / Stride API.
 * Forward-looking for the current service day; no API key required.
 */
export async function getScheduleArrivals(
  stopCode: number,
  windowMinutes = 90
): Promise<Arrival[]> {
  const now = new Date();
  const from = now.toISOString().slice(0, 19) + "Z";
  const to =
    new Date(now.getTime() + windowMinutes * 60_000)
      .toISOString()
      .slice(0, 19) + "Z";
  const day = now.toISOString().slice(0, 10);

  const url =
    `${API}/gtfs_ride_stops/list?limit=60` +
    `&gtfs_stop__code=${stopCode}` +
    `&gtfs_stop__date_from=${day}&gtfs_stop__date_to=${day}` +
    `&arrival_time_from=${encodeURIComponent(from)}` +
    `&arrival_time_to=${encodeURIComponent(to)}` +
    `&order_by=${encodeURIComponent("arrival_time asc")}`;

  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`Stride gtfs_ride_stops HTTP ${res.status}`);
  const rows = (await res.json()) as RideStop[];

  return rows.map((r) => {
    const arrival = new Date(r.arrival_time);
    return {
      line: r.gtfs_route__route_short_name ?? "",
      destination: destinationFromLongName(r.gtfs_route__route_long_name),
      agency: r.gtfs_route__agency_name ?? "",
      arrivalTime: arrival.toISOString(),
      minutesAway: Math.round((arrival.getTime() - now.getTime()) / 60_000),
      live: false,
    };
  });
}

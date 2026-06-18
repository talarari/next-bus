import type { ArrivalsResult } from "./types";
import { getScheduleArrivals } from "./stride";
import { getSiriArrivals, isSiriConfigured } from "./motSiri";

export type { Arrival, ArrivalsResult } from "./types";

/**
 * Returns arrivals for a stop. Prefers live SIRI predictions when configured,
 * and falls back to the open published schedule otherwise (or on SIRI error).
 */
export async function getArrivals(stopCode: number): Promise<ArrivalsResult> {
  if (isSiriConfigured()) {
    try {
      const arrivals = await getSiriArrivals(stopCode);
      if (arrivals.length > 0) {
        return { stopCode, source: "siri", arrivals };
      }
    } catch (err) {
      console.error("SIRI lookup failed, falling back to schedule:", err);
    }
  }
  const arrivals = await getScheduleArrivals(stopCode);
  return { stopCode, source: "schedule", arrivals };
}

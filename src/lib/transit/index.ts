import type { ArrivalsResult } from "./types";
import { getMotGovArrivals } from "./motGov";
import { getScheduleArrivals } from "./stride";
import { getSiriArrivals, isSiriConfigured } from "./motSiri";

export type { Arrival, ArrivalsResult } from "./types";

/**
 * Returns arrivals for a stop, best source first:
 *   1. MoT public real-time API (bus.gov.il) — live, no key required.
 *   2. MoT SIRI — live, only if MOT_SIRI_API_KEY is configured.
 *   3. Open published schedule (Open Bus / Stride) — always-on fallback.
 */
export async function getArrivals(
  stopCode: number,
  limit = 18
): Promise<ArrivalsResult> {
  const cap = (r: ArrivalsResult): ArrivalsResult => ({
    ...r,
    arrivals: r.arrivals.slice(0, limit),
  });

  try {
    const arrivals = await getMotGovArrivals(stopCode);
    if (arrivals.length > 0) {
      return cap({ stopCode, source: "realtime", arrivals });
    }
  } catch (err) {
    console.error("bus.gov.il lookup failed:", err);
  }

  if (isSiriConfigured()) {
    try {
      const arrivals = await getSiriArrivals(stopCode);
      if (arrivals.length > 0) {
        return cap({ stopCode, source: "siri", arrivals });
      }
    } catch (err) {
      console.error("SIRI lookup failed:", err);
    }
  }

  const arrivals = await getScheduleArrivals(stopCode);
  return cap({ stopCode, source: "schedule", arrivals });
}

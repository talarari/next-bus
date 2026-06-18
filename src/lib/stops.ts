import { haversineMeters } from "./geo";
import stopsData from "../../data/stops.json";

export interface Stop {
  code: number;
  name: string;
  lat: number;
  lon: number;
  city: string;
}

interface RawStop {
  c: number;
  n: string;
  y: number;
  x: number;
  city: string;
}

const STOPS: Stop[] = (stopsData as RawStop[]).map((s) => ({
  code: s.c,
  name: s.n,
  lat: s.y,
  lon: s.x,
  city: s.city,
}));

export interface NearbyStop extends Stop {
  distanceMeters: number;
}

export function findNearbyStops(
  lat: number,
  lon: number,
  limit = 5
): NearbyStop[] {
  // Pre-filter with a cheap bounding box (~0.02deg ≈ 2.2km) before the full
  // haversine sort, so we don't measure all ~30k stops for every request.
  const box = 0.03;
  const candidates: NearbyStop[] = [];
  for (const s of STOPS) {
    if (Math.abs(s.lat - lat) > box || Math.abs(s.lon - lon) > box) continue;
    candidates.push({
      ...s,
      distanceMeters: haversineMeters(lat, lon, s.lat, s.lon),
    });
  }
  candidates.sort((a, b) => a.distanceMeters - b.distanceMeters);
  return candidates.slice(0, limit);
}

export function getStopByCode(code: number): Stop | undefined {
  return STOPS.find((s) => s.code === code);
}

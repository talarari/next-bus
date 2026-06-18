// Builds a compact data/stops.json from the open Open Bus Stride API.
// Each entry: { c: stop code, n: name, y: lat, x: lon, city }
// Run: node scripts/build-stops.mjs
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const API = "https://open-bus-stride-api.hasadna.org.il";
const PAGE = 1000;
const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, "..", "data", "stops.json");

const today = new Date().toISOString().slice(0, 10);

async function fetchPage(offset) {
  const url =
    `${API}/gtfs_stops/list?limit=${PAGE}&offset=${offset}` +
    `&date_from=${today}&date_to=${today}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`stops page ${offset} -> HTTP ${res.status}`);
  return res.json();
}

async function main() {
  const byCode = new Map();
  for (let offset = 0; ; offset += PAGE) {
    const rows = await fetchPage(offset);
    if (!rows.length) break;
    for (const s of rows) {
      if (s.code == null || s.lat == null || s.lon == null) continue;
      // stop codes are stable across dates; keep one entry per code
      if (!byCode.has(s.code)) {
        byCode.set(s.code, {
          c: s.code,
          n: s.name ?? "",
          y: Number(s.lat.toFixed(6)),
          x: Number(s.lon.toFixed(6)),
          city: s.city ?? "",
        });
      }
    }
    process.stdout.write(`\rfetched ${byCode.size} stops (offset ${offset})`);
    if (rows.length < PAGE) break;
  }
  const stops = [...byCode.values()].sort((a, b) => a.c - b.c);
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, JSON.stringify(stops));
  console.log(`\nwrote ${stops.length} stops -> ${OUT}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

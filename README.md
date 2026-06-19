# האוטובוס הבא · Next Bus

A small web app that shows the **next buses arriving at the bus stop nearest to
your current location** in Israel, with how many minutes away each one is.

- 📍 Uses the browser's geolocation to find the closest stop(s).
- 🚌 Lists upcoming lines, destination, operator and ETA.
- 🔄 Auto-refreshes, and lets you switch between nearby stops.
- 🇮🇱 Hebrew, RTL UI.

## Data sources

| Layer | Source | Key required |
| --- | --- | --- |
| Nearest stop search | Bundled `data/stops.json` (~30k stops, generated from the open [Open Bus / Stride API](https://open-bus-stride-api.hasadna.org.il/docs)) | No |
| **Live arrivals (default)** | Ministry of Transport public passenger API ([bus.gov.il](https://bus.gov.il)) `GetRealtimeBusLineListByBustop` | **No** |
| Live arrivals (alt) | Ministry of Transport **SIRI** Stop Monitoring | Yes |
| Arrivals fallback | Published GTFS schedule via [Open Bus / Stride](https://github.com/hasadna/open-bus) `gtfs_ride_stops` | No |

Out of the box the app shows **real-time** arrivals with **no key** — it uses
the same public `bus.gov.il` endpoint that powers the official MoT journey
planner, which returns live minutes-to-arrival per line. Stop codes there are
standard GTFS stop codes, so the bundled stop list feeds straight into it.

The provider chain (see `src/lib/transit/index.ts`) is: public real-time
→ SIRI (only if a key is configured) → published schedule. Each result is
labelled `● זמן אמת` (live) or `● לפי לוח זמנים` (schedule).

## Getting started

```bash
npm install
npm run dev
# open http://localhost:3000 and allow location access
```

## Live (SIRI) data — optional

1. Request a user code by emailing a signed access form to
   `ptsupport@mot.gov.il` — see the official
   [developer page](https://www.gov.il/he/Departments/General/real_time_information_siri).
2. Copy `.env.example` to `.env.local` and set `MOT_SIRI_API_KEY` (and
   `MOT_SIRI_ENDPOINT` if your onboarding specifies a different host).
3. Restart the dev server.

> The SIRI request envelope in `src/lib/transit/motSiri.ts` follows the standard
> SIRI 2.0 StopMonitoring shape with the user code as `RequestorRef`. Verify it
> against your onboarding documentation — the app degrades gracefully to the
> published schedule if the live request fails.

## Refreshing the stops dataset

Stop codes are stable, but to regenerate the bundled list (e.g. for new stops):

```bash
npm run build:stops
```

## Project layout

```
data/stops.json              compact stop list (code, name, lat, lon, city)
scripts/build-stops.mjs      regenerates data/stops.json from the open API
src/lib/geo.ts               haversine distance
src/lib/stops.ts             nearest-stop search over the bundled dataset
src/lib/transit/stride.ts    open published-schedule arrivals
src/lib/transit/motSiri.ts   live MoT SIRI arrivals (key-gated)
src/lib/transit/index.ts     provider selection (SIRI → schedule fallback)
src/app/api/stops/nearby     GET ?lat&lon&limit  → nearest stops
src/app/api/arrivals         GET ?code           → arrivals for a stop
src/app/page.tsx             client UI (geolocation, list, auto-refresh)
```

## Credits

Schedule and real-time pipeline by the
[Public Knowledge Workshop — Open Bus project (hasadna)](https://github.com/hasadna/open-bus).
Real-time data originates from the Israel Ministry of Transport SIRI feed.

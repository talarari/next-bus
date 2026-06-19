# האוטובוס הבא · Next Bus

A tiny **fully client-side** web app that shows the **next buses arriving at the
bus stop nearest to your location** in Israel — line, destination, operator and
minutes away. No backend, no build step, **no API key**.

- 📍 Browser geolocation finds the closest stop(s).
- 🚌 **Live** minutes-to-arrival per line.
- 🔄 Auto-refreshes every 30s; tap a chip to switch nearby stops.
- 🇮🇱 Hebrew, RTL.

## How it works

Everything runs in the browser:

| Layer | Source | Key |
| --- | --- | --- |
| Nearest stop | Bundled `data/stops.json` (~30k stops) + haversine in JS | — |
| **Live arrivals** | [bus.gov.il](https://bus.gov.il) public passenger API (`GetRealtimeBusLineListByBustop`, CORS-enabled) | **None** |
| Fallback | Published schedule via the open [Open Bus / Stride API](https://open-bus-stride-api.hasadna.org.il/docs) | None |

Both APIs send `Access-Control-Allow-Origin: *`, so the page calls them
directly — there is no server. Stop codes are standard GTFS codes, so the
bundled list feeds straight into the live endpoint. Each result is labelled
`● זמן אמת` (live) or `● לפי לוח זמנים` (schedule).

> Note: `bus.gov.il` is the (undocumented) backend of the official journey
> planner, not a contracted developer API — it has no SLA and could change.
> That's why the open schedule is kept as an automatic fallback.

## Run locally

Geolocation needs a secure context, so serve over `localhost` (not `file://`):

```bash
python3 -m http.server 8000   # or: npx serve .
# open http://localhost:8000 and allow location access
```

## Deploy (GitHub Pages)

Pushing to `main` deploys automatically via
[`.github/workflows/deploy.yml`](.github/workflows/deploy.yml). The workflow
enables Pages on first run (source = GitHub Actions) and publishes the repo
root as a static site. After the first successful run the site is at:

```
https://<user>.github.io/next-bus/
```

If Actions are restricted on the repo, enable them once under
**Settings → Actions**, and **Settings → Pages → Source: GitHub Actions**.

## Files

```
index.html                 markup
styles.css                 styles
app.js                     all logic (geo, nearest stop, live + schedule)
data/stops.json            bundled stop list (code, name, lat, lon, city)
scripts/build-stops.mjs    regenerates data/stops.json from the open API
.github/workflows/deploy.yml  GitHub Pages deployment
```

## Refresh the stops dataset

```bash
npm run build:stops        # node scripts/build-stops.mjs
```

## Credits

Real-time data originates from the Israel Ministry of Transport. Schedule data
and the open pipeline are by the
[Public Knowledge Workshop — Open Bus project (hasadna)](https://github.com/hasadna/open-bus).

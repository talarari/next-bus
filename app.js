// Next Bus — a fully client-side app. No server, no API key.
// Nearest stop: bundled stops.json + haversine.
// Live arrivals: bus.gov.il public API (CORS-enabled).
// Fallback: published schedule from the open Open Bus / Stride API.

const REFRESH_MS = 30_000;
const ARRIVALS_LIMIT = 18;

const el = (id) => document.getElementById(id);
const errorBox = el("error");

let stops = []; // full bundled dataset
let nearby = []; // current nearby list
let selected = null;
let refreshTimer = null;

/* ---------- data loading ---------- */

async function loadStops() {
  if (stops.length) return stops;
  const res = await fetch("./data/stops.json");
  if (!res.ok) throw new Error("stops dataset failed to load");
  const raw = await res.json();
  // {c,n,y,x,city} -> {code,name,lat,lon,city}
  stops = raw.map((s) => ({
    code: s.c,
    name: s.n,
    lat: s.y,
    lon: s.x,
    city: s.city,
  }));
  return stops;
}

/* ---------- geo ---------- */

function haversineMeters(aLat, aLon, bLat, bLon) {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLon = toRad(bLon - aLon);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function findNearbyStops(lat, lon, limit = 6) {
  const box = 0.03; // ~3km bounding-box prefilter
  const out = [];
  for (const s of stops) {
    if (Math.abs(s.lat - lat) > box || Math.abs(s.lon - lon) > box) continue;
    out.push({ ...s, distanceMeters: haversineMeters(lat, lon, s.lat, s.lon) });
  }
  out.sort((a, b) => a.distanceMeters - b.distanceMeters);
  return out.slice(0, limit);
}

/* ---------- arrivals: live (bus.gov.il) ---------- */

function destFromDescription(desc) {
  if (!desc) return "";
  const parts = desc.split(" - ");
  return (parts[parts.length - 1] ?? desc).trim();
}

async function getLiveArrivals(code) {
  const url = `https://bus.gov.il/WebApi/api/passengerinfo/GetRealtimeBusLineListByBustop/${code}/he/false`;
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`bus.gov.il HTTP ${res.status}`);
  const rows = await res.json();
  if (!rows) return [];
  const now = Date.now();
  const arrivals = [];
  for (const r of rows) {
    const mins =
      Array.isArray(r.MinutesToArrivalList) && r.MinutesToArrivalList.length
        ? r.MinutesToArrivalList
        : r.MinutesToArrival != null
          ? [r.MinutesToArrival]
          : [];
    for (const m of mins) {
      arrivals.push({
        line: (r.Shilut ?? "").trim(),
        destination: destFromDescription(r.Description),
        agency: (r.CompanyName ?? "").trim(),
        minutesAway: m,
        live: true,
      });
    }
  }
  return arrivals.sort((a, b) => a.minutesAway - b.minutesAway);
}

/* ---------- arrivals: schedule fallback (Stride) ---------- */

function destFromLongName(longName) {
  if (!longName) return "";
  const tail = (longName.split("<->")[1] ?? longName).trim();
  return tail.replace(/-\d+#?$/, "").trim();
}

async function getScheduleArrivals(code) {
  const now = new Date();
  const from = now.toISOString().slice(0, 19) + "Z";
  const to = new Date(now.getTime() + 90 * 60000).toISOString().slice(0, 19) + "Z";
  const day = now.toISOString().slice(0, 10);
  const url =
    "https://open-bus-stride-api.hasadna.org.il/gtfs_ride_stops/list?limit=60" +
    `&gtfs_stop__code=${code}&gtfs_stop__date_from=${day}&gtfs_stop__date_to=${day}` +
    `&arrival_time_from=${encodeURIComponent(from)}` +
    `&arrival_time_to=${encodeURIComponent(to)}` +
    `&order_by=${encodeURIComponent("arrival_time asc")}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Stride HTTP ${res.status}`);
  const rows = await res.json();
  return rows.map((r) => ({
    line: r.gtfs_route__route_short_name ?? "",
    destination: destFromLongName(r.gtfs_route__route_long_name),
    agency: r.gtfs_route__agency_name ?? "",
    minutesAway: Math.round((new Date(r.arrival_time) - now) / 60000),
    live: false,
  }));
}

async function getArrivals(code) {
  try {
    const live = await getLiveArrivals(code);
    if (live.length) return { source: "live", arrivals: live.slice(0, ARRIVALS_LIMIT) };
  } catch (e) {
    console.error("live arrivals failed:", e);
  }
  const sched = await getScheduleArrivals(code);
  return { source: "schedule", arrivals: sched.slice(0, ARRIVALS_LIMIT) };
}

/* ---------- rendering ---------- */

function showError(msg) {
  errorBox.textContent = msg;
  errorBox.hidden = !msg;
}

function renderStopCard(stop, result) {
  const badge = result
    ? `<span class="source-badge ${result.source === "schedule" ? "schedule" : "live"}">${
        result.source === "schedule" ? "● לפי לוח זמנים" : "● זמן אמת"
      }</span>`
    : "";
  el("stop-card").innerHTML = `
    <div class="stop-name">${stop.name || "תחנה"}</div>
    <div class="stop-meta">${stop.city} · קוד ${stop.code} · ${Math.round(
      stop.distanceMeters
    )} מ׳ ממך</div>
    ${badge}`;
}

function renderArrivals(result, loading) {
  const box = el("arrivals");
  if (loading && !result) {
    box.innerHTML = `<p class="muted">טוען זמני אוטובוסים<span class="spinner"></span></p>`;
    return;
  }
  if (!result) return;
  if (!result.arrivals.length) {
    box.innerHTML = `<p class="muted">אין אוטובוסים קרובים בשעה הקרובה.</p>`;
    return;
  }
  box.innerHTML =
    '<ul class="arrivals">' +
    result.arrivals
      .map((a) => {
        const soon = a.minutesAway <= 1;
        return `<li class="arrival">
          <span class="line-badge">${a.line || "?"}</span>
          <span class="arrival-info">
            <span class="dest">${a.destination || "—"}</span>
            <span class="agency">${a.agency}</span>
          </span>
          <span class="eta ${soon ? "now" : ""}">
            <span class="min">${soon ? "עכשיו" : a.minutesAway}</span>
            ${soon ? "" : '<span class="lbl">דק׳</span>'}
          </span>
        </li>`;
      })
      .join("") +
    "</ul>";
}

function renderChips() {
  el("chips").innerHTML = nearby
    .map(
      (s) =>
        `<span class="chip ${selected?.code === s.code ? "active" : ""}" data-code="${
          s.code
        }">${(s.name || "תחנה " + s.code).slice(0, 22)} · ${Math.round(
          s.distanceMeters
        )} מ׳</span>`
    )
    .join("");
  el("chips")
    .querySelectorAll(".chip")
    .forEach((c) =>
      c.addEventListener("click", () => {
        const stop = nearby.find((s) => s.code === Number(c.dataset.code));
        if (stop) selectStop(stop);
      })
    );
}

/* ---------- flow ---------- */

async function selectStop(stop) {
  selected = stop;
  renderChips();
  renderStopCard(stop, null);
  renderArrivals(null, true);
  await refreshArrivals();
}

async function refreshArrivals() {
  if (!selected) return;
  try {
    const result = await getArrivals(selected.code);
    renderStopCard(selected, result);
    renderArrivals(result, false);
    showError("");
  } catch (e) {
    console.error(e);
    showError("לא הצלחנו לטעון זמני אוטובוסים. נסו שוב.");
  }
}

function showView(name) {
  el("loading").hidden = name !== "loading";
  el("start").hidden = name !== "start";
  el("results").hidden = name !== "results";
}

function locate() {
  showError("");
  const btn2 = el("refresh-loc");
  if (btn2) btn2.disabled = true;
  // Keep current results visible on re-locate; otherwise show the loader.
  if (el("results").hidden) showView("loading");

  if (!("geolocation" in navigator)) {
    showView("start");
    showError("הדפדפן לא תומך באיתור מיקום.");
    if (btn2) btn2.disabled = false;
    return;
  }

  navigator.geolocation.getCurrentPosition(
    async (pos) => {
      try {
        await loadStops();
        const { latitude, longitude } = pos.coords;
        nearby = findNearbyStops(latitude, longitude, 6);
        if (!nearby.length) {
          showView("start");
          showError("לא נמצאו תחנות בקרבת מקום.");
          return;
        }
        showView("results");
        await selectStop(nearby[0]);
        if (refreshTimer) clearInterval(refreshTimer);
        refreshTimer = setInterval(refreshArrivals, REFRESH_MS);
      } catch (e) {
        console.error(e);
        showView("start");
        showError("שגיאה באיתור תחנות קרובות.");
      } finally {
        if (btn2) btn2.disabled = false;
      }
    },
    () => {
      showView("start");
      showError("לא ניתן לקבל גישה למיקום. אשרו הרשאת מיקום ונסו שוב.");
      if (btn2) btn2.disabled = false;
    },
    { enableHighAccuracy: true, timeout: 10_000, maximumAge: 30_000 }
  );
}

el("locate").addEventListener("click", locate);
el("refresh-loc").addEventListener("click", locate);

// Auto-locate on open so arrivals show immediately (prompts for permission).
locate();

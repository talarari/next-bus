// Headless test of the full client flow with jsdom.
// Mocks geolocation, permissions, and fetch, then loads index.html + app.js
// and asserts that auto-locate renders live arrivals and the stop dropdown.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { JSDOM } from "jsdom";

const dir = join(dirname(fileURLToPath(import.meta.url)), "..");
const html = readFileSync(join(dir, "index.html"), "utf8");
const appJs = readFileSync(join(dir, "app.js"), "utf8");
const stopsJson = readFileSync(join(dir, "data", "stops.json"), "utf8");

// Sample bus.gov.il realtime payload (shape verified against the live API).
const liveSample = [
  {
    Shilut: "40",
    CompanyName: "דן",
    Description: "חולון,קרית שרת - תל-אביב,אוניברסיטה",
    MinutesToArrival: 0,
    MinutesToArrivalList: [0, 18],
  },
  {
    Shilut: "171",
    CompanyName: "אגד",
    Description: "חולון,חניון - תל-אביב,אזורי חן מאוד ארוך שם של יעד",
    MinutesToArrival: 4,
    MinutesToArrivalList: [4],
  },
];

const fails = [];
const assert = (cond, msg) => {
  if (cond) console.log("  ✓", msg);
  else {
    console.error("  ✗", msg);
    fails.push(msg);
  }
};

function run({ permissionState, expectView }) {
  return new Promise((resolve) => {
    // Strip the real module <script src> so only our injected copy runs.
    const cleanHtml = html.replace(/<script[^>]*app\.js[^>]*><\/script>/, "");
    const dom = new JSDOM(cleanHtml, {
      runScripts: "dangerously",
      url: "https://example.com/",
      pretendToBeVisual: true,
    });
    const { window } = dom;

    // --- mocks ---
    let geoCalls = 0;
    window.navigator.geolocation = {
      getCurrentPosition: (ok) => {
        geoCalls++;
        setTimeout(
          () => ok({ coords: { latitude: 32.0837, longitude: 34.795 } }),
          0
        );
      },
    };
    // Controllable clock so we can simulate the page going stale.
    let nowOffset = 0;
    const realNow = Date.now;
    window.Date.now = () => realNow() + nowOffset;
    window.navigator.permissions = {
      query: async () => ({ state: permissionState }),
    };
    window.fetch = async (url) => {
      const u = String(url);
      if (u.includes("stops.json")) {
        return { ok: true, json: async () => JSON.parse(stopsJson) };
      }
      if (u.includes("GetRealtimeBusLineListByBustop")) {
        return { ok: true, json: async () => liveSample };
      }
      throw new Error("unexpected fetch: " + u);
    };

    // Run the app.
    const script = window.document.createElement("script");
    script.textContent = appJs;
    window.document.body.appendChild(script);

    const wait = (ms) => new Promise((r) => setTimeout(r, ms));

    // Let the async chain settle.
    setTimeout(async () => {
      const d = window.document;
      const visible = (id) => !d.getElementById(id).hidden;

      console.log(`\n[permission=${permissionState}] expect view: ${expectView}`);
      assert(visible(expectView), `${expectView} view is visible`);

      if (expectView === "results") {
        const opts = d.querySelectorAll("#stop-menu .dropdown-item");
        assert(opts.length >= 2, `stop dropdown populated (${opts.length} items)`);

        const toggle = d
          .querySelector("#stop-toggle .dropdown-label")
          .textContent.trim();
        assert(toggle.length > 0, `dropdown toggle shows a stop (${toggle})`);

        const rows = d.querySelectorAll("li.arrival");
        assert(rows.length === 3, `3 arrival rows rendered (got ${rows.length})`);

        const minutes = [...d.querySelectorAll(".eta .min")].map((e) =>
          e.textContent.trim()
        );
        assert(
          minutes[0] === "עכשיו" && minutes.includes("18") && minutes.includes("4"),
          `ETAs sorted & expanded: ${minutes.join(", ")}`
        );

        const firstLine = d.querySelector("li.arrival .line-badge").textContent;
        assert(firstLine === "40", `first line is 40 (got ${firstLine})`);

        const badge = d.querySelector(".source-badge");
        assert(badge && badge.textContent.includes("זמן אמת"), "live badge shown");

        const rs = d.getElementById("refresh-status");
        const rsText = d.getElementById("refresh-text").textContent;
        assert(
          !rs.hidden && /מתעדכן אוטומטית/.test(rsText),
          `auto-refresh indicator shown (${rsText})`
        );

        assert(
          d.getElementById("install").hidden,
          "install button hidden until installable"
        );

        // In-app dropdown opens inline and selecting a stop updates the toggle.
        const click = () => new window.MouseEvent("click", { bubbles: true });
        d.getElementById("stop-toggle").dispatchEvent(click());
        assert(!d.getElementById("stop-menu").hidden, "dropdown opens inline on click");

        const second = d.querySelectorAll("#stop-menu .dropdown-item")[1];
        const secondLabel = second.textContent.trim();
        second.dispatchEvent(click());
        assert(d.getElementById("stop-menu").hidden, "dropdown closes after selecting");
        const newToggle = d
          .querySelector("#stop-toggle .dropdown-label")
          .textContent.trim();
        assert(newToggle === secondLabel, `toggle updates to picked stop`);

        const pageshow = () => {
          const ev = new window.Event("pageshow");
          Object.defineProperty(ev, "persisted", { value: true });
          window.dispatchEvent(ev);
        };

        // Short return (minutes later): must NOT re-locate, only refresh times.
        const beforeShort = geoCalls;
        nowOffset = 3 * 60_000; // 3 minutes
        pageshow();
        await wait(30);
        assert(
          geoCalls === beforeShort,
          `short return keeps the stop, no re-locate (geo calls stayed ${geoCalls})`
        );

        // Long absence (hours later): re-detects location.
        const beforeLong = geoCalls;
        nowOffset = 2 * 60 * 60 * 1000; // 2 hours
        pageshow();
        await wait(30);
        assert(
          geoCalls === beforeLong + 1,
          `long absence re-detects location (geo calls ${beforeLong} -> ${geoCalls})`
        );
      }
      resolve();
    }, 150);
  });
}

(async () => {
  console.log("Running headless flow tests...");
  // Permission already granted -> auto-locate straight to results.
  await run({ permissionState: "granted", expectView: "results" });
  // Permission must be prompted -> show button (NO infinite loading).
  await run({ permissionState: "prompt", expectView: "start" });

  console.log("");
  if (fails.length) {
    console.error(`FAILED: ${fails.length} assertion(s)`);
    process.exit(1);
  }
  console.log("ALL TESTS PASSED");
  process.exit(0); // app.js sets a refresh interval that keeps the loop alive
})();

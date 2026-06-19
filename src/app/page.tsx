"use client";

import { useCallback, useEffect, useRef, useState } from "react";

interface NearbyStop {
  code: number;
  name: string;
  city: string;
  lat: number;
  lon: number;
  distanceMeters: number;
}

interface Arrival {
  line: string;
  destination: string;
  agency: string;
  arrivalTime: string;
  minutesAway: number;
  live: boolean;
}

interface ArrivalsResult {
  stopCode: number;
  source: "realtime" | "siri" | "schedule";
  arrivals: Arrival[];
}

const REFRESH_MS = 30_000;

export default function Page() {
  const [stops, setStops] = useState<NearbyStop[]>([]);
  const [selected, setSelected] = useState<NearbyStop | null>(null);
  const [result, setResult] = useState<ArrivalsResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);
  const [loadingArrivals, setLoadingArrivals] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadArrivals = useCallback(async (stop: NearbyStop) => {
    setLoadingArrivals(true);
    setError(null);
    try {
      const res = await fetch(`/api/arrivals?code=${stop.code}`);
      if (!res.ok) throw new Error("arrivals request failed");
      setResult((await res.json()) as ArrivalsResult);
    } catch {
      setError("לא הצלחנו לטעון זמני אוטובוסים. נסו שוב.");
    } finally {
      setLoadingArrivals(false);
    }
  }, []);

  const locate = useCallback(() => {
    setError(null);
    setLocating(true);
    if (!("geolocation" in navigator)) {
      setError("הדפדפן לא תומך באיתור מיקום.");
      setLocating(false);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const { latitude, longitude } = pos.coords;
          const res = await fetch(
            `/api/stops/nearby?lat=${latitude}&lon=${longitude}&limit=6`
          );
          if (!res.ok) throw new Error("nearby request failed");
          const data = (await res.json()) as { stops: NearbyStop[] };
          setStops(data.stops);
          if (data.stops.length > 0) {
            setSelected(data.stops[0]);
            await loadArrivals(data.stops[0]);
          } else {
            setError("לא נמצאו תחנות בקרבת מקום.");
          }
        } catch {
          setError("שגיאה באיתור תחנות קרובות.");
        } finally {
          setLocating(false);
        }
      },
      () => {
        setError("לא ניתן לקבל גישה למיקום. אשרו הרשאת מיקום ונסו שוב.");
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 30_000 }
    );
  }, [loadArrivals]);

  // Auto-refresh arrivals for the selected stop.
  useEffect(() => {
    if (!selected) return;
    if (timer.current) clearInterval(timer.current);
    timer.current = setInterval(() => loadArrivals(selected), REFRESH_MS);
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [selected, loadArrivals]);

  const pickStop = (stop: NearbyStop) => {
    setSelected(stop);
    setResult(null);
    loadArrivals(stop);
  };

  return (
    <main>
      <div className="title">האוטובוס הבא 🚌</div>
      <div className="subtitle">
        זמני האוטובוסים הקרובים לתחנה הקרובה אליך
      </div>

      {error && <div className="error">{error}</div>}

      {stops.length === 0 ? (
        <>
          <button
            className="refresh"
            onClick={locate}
            disabled={locating}
          >
            {locating ? "מאתר מיקום…" : "מצא תחנה קרובה"}
            {locating && <span className="spinner" />}
          </button>
          <p className="muted" style={{ marginTop: 16 }}>
            לחצו על הכפתור ואשרו גישה למיקום כדי לראות אילו קווים מגיעים
            לתחנה הקרובה ובעוד כמה דקות.
          </p>
        </>
      ) : (
        <>
          {selected && (
            <div className="stop-card">
              <div className="stop-name">{selected.name || "תחנה"}</div>
              <div className="stop-meta">
                {selected.city} · קוד {selected.code} ·{" "}
                {Math.round(selected.distanceMeters)} מ׳ ממך
              </div>
              {result && (
                <span
                  className={`source-badge ${
                    result.source === "schedule" ? "schedule" : "live"
                  }`}
                >
                  {result.source === "schedule"
                    ? "● לפי לוח זמנים"
                    : "● זמן אמת"}
                </span>
              )}
            </div>
          )}

          <ArrivalsList
            result={result}
            loading={loadingArrivals}
          />

          <div className="other-stops">
            <h3>תחנות נוספות בקרבת מקום</h3>
            {stops.map((s) => (
              <span
                key={s.code}
                className={`chip ${
                  selected?.code === s.code ? "active" : ""
                }`}
                onClick={() => pickStop(s)}
              >
                {(s.name || `תחנה ${s.code}`).slice(0, 22)} ·{" "}
                {Math.round(s.distanceMeters)} מ׳
              </span>
            ))}
          </div>

          <button
            className="refresh"
            style={{ marginTop: 16 }}
            onClick={locate}
            disabled={locating}
          >
            {locating ? "מאתר…" : "רענן מיקום"}
            {locating && <span className="spinner" />}
          </button>
        </>
      )}

      <div className="footer">
        נתוני לוח זמנים: מיזם{" "}
        <a
          href="https://github.com/hasadna/open-bus"
          target="_blank"
          rel="noreferrer"
        >
          תחבורה ציבורית פתוחה (hasadna)
        </a>{" "}
        · זמן אמת דרך ממשק SIRI של משרד התחבורה
      </div>
    </main>
  );
}

function ArrivalsList({
  result,
  loading,
}: {
  result: ArrivalsResult | null;
  loading: boolean;
}) {
  if (loading && !result) {
    return (
      <p className="muted">
        טוען זמני אוטובוסים<span className="spinner" />
      </p>
    );
  }
  if (!result) return null;
  if (result.arrivals.length === 0) {
    return <p className="muted">אין אוטובוסים קרובים בשעה הקרובה.</p>;
  }
  return (
    <ul className="arrivals">
      {result.arrivals.map((a, i) => {
        const soon = a.minutesAway <= 1;
        return (
          <li className="arrival" key={`${a.line}-${a.arrivalTime}-${i}`}>
            <span className="line-badge">{a.line || "?"}</span>
            <span className="arrival-info">
              <span className="dest">{a.destination || "—"}</span>
              <span className="agency">{a.agency}</span>
            </span>
            <span className={`eta ${soon ? "now" : ""}`}>
              <span className="min">
                {soon ? "עכשיו" : a.minutesAway}
              </span>
              {!soon && <span className="lbl">דק׳</span>}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

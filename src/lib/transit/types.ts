export interface Arrival {
  /** Public line number, e.g. "40", "171". */
  line: string;
  /** Human destination / headsign. */
  destination: string;
  /** Operator / agency name, e.g. "דן", "אגד". */
  agency: string;
  /** ISO timestamp of expected (live) or scheduled arrival. */
  arrivalTime: string;
  /** Minutes from now until arrival (may be negative if just passed). */
  minutesAway: number;
  /** true when sourced from live SIRI predictions, false for schedule. */
  live: boolean;
}

export interface ArrivalsResult {
  stopCode: number;
  source: "siri" | "schedule";
  arrivals: Arrival[];
}

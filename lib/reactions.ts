import { dailyCandles, type DailyTuple } from "@/lib/candles";
import { locateFilings, type Filing } from "@/lib/markers";

// Price reaction after a report filing: percentage change of the daily close
// N trading sessions after the filing day, relative to the filing day's close.
// The filing day is the session of `filingDate` (or the next session when it
// falls on a non-trading day), i.e. the bar the chart marker sits on.

export interface Horizon {
  id: string;
  label: string;
  /** Trading sessions after the filing day. */
  sessions: number;
}

export const HORIZONS: readonly Horizon[] = [
  { id: "1d", label: "+1 Day", sessions: 1 },
  { id: "1w", label: "+1 Week", sessions: 5 },
  { id: "1m", label: "+1 Month", sessions: 21 },
];

export interface HorizonReaction {
  horizon: Horizon;
  /** Session date (YYYY-MM-DD) and close, or null when the history ends first. */
  date: string | null;
  close: number | null;
  /** Percentage change vs the filing-day close, or null when unavailable. */
  pct: number | null;
}

export interface FilingReaction {
  filing: Filing;
  /** Session the reaction is measured from (the marker bar). */
  baseDate: string;
  baseClose: number;
  /** True when `filingDate` was not a trading day and the next session is used. */
  shifted: boolean;
  horizons: HorizonReaction[];
}

/** One row of the reaction table: a stock and the reaction to its in-scope filing. */
export interface ReactionRow {
  symbol: string;
  name: string;
  color: string;
  reaction: FilingReaction | null;
  /** Filings in scope that have no price history after them. */
  unavailable: string[];
}

/** Reaction after one filing, or null when the filing lies outside the price history. */
export function filingReaction(
  daily: readonly DailyTuple[],
  filing: Filing,
  horizons: readonly Horizon[] = HORIZONS
): FilingReaction | null {
  const [located] = locateFilings(dailyCandles(daily), [filing]);
  if (located.index === null) return null;
  const base = daily[located.index];
  const baseClose = base[4];
  return {
    filing,
    baseDate: base[0],
    baseClose,
    shifted: located.shifted,
    horizons: horizons.map((horizon) => {
      const row = daily[located.index! + horizon.sessions];
      if (!row) return { horizon, date: null, close: null, pct: null };
      return { horizon, date: row[0], close: row[4], pct: (row[4] / baseClose - 1) * 100 };
    }),
  };
}

/** Filings submitted during a calendar year (by `filingDate`). */
export function filingsInYear(filings: readonly Filing[], year: number): Filing[] {
  return filings.filter((f) => f.filingDate.startsWith(`${year}-`));
}

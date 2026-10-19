import { formatDate, parseDateUTC, type Candle } from "@/lib/candles";

// Chart markers for annual-report filings. A filing is located on the chart
// by its SEC submission date (`filingDate`, YYYY-MM-DD): the marker sits on the
// bar of that trading day, or — if the date falls on a non-trading day — on
// the next available session. On intraday timeframes that is the session's
// first bar (09:30 ET), since the source data carries the date only.

export interface Filing {
  /** Fiscal year the report covers, e.g. "2024". */
  fiscalYear: string;
  /** Last day of the reporting period (YYYY-MM-DD). */
  periodEnd: string;
  /** Date the report was submitted to the SEC (YYYY-MM-DD). */
  filingDate: string;
}

export interface ChartMarker {
  /** Index of the bar the marker is attached to. */
  index: number;
  /** Short label drawn above the arrow, e.g. "FY2024 filing". */
  label: string;
  /** Full description for the legend / tooltip. */
  description: string;
}

export interface LocatedFiling {
  filing: Filing;
  /** Bar index, or null when the filing date lies outside the price history. */
  index: number | null;
  /** True when the marker had to move to the next session (non-trading day). */
  shifted: boolean;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isIsoDate(value: unknown): value is string {
  return typeof value === "string" && DATE_RE.test(value) && !Number.isNaN(parseDateUTC(value));
}

/** Index of the first bar whose time is >= `time`, or -1 when none. Bars must be sorted. */
function firstBarAtOrAfter(bars: readonly Candle[], time: number): number {
  let lo = 0;
  let hi = bars.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (bars[mid].time < time) lo = mid + 1;
    else hi = mid;
  }
  return lo < bars.length ? lo : -1;
}

/** Attach each filing to a bar of the series (or null when it lies outside the history). */
export function locateFilings(bars: readonly Candle[], filings: readonly Filing[]): LocatedFiling[] {
  return filings.map((filing) => {
    const dayStart = parseDateUTC(filing.filingDate);
    const index = bars.length > 0 && dayStart >= startOfDay(bars[0].time) ? firstBarAtOrAfter(bars, dayStart) : -1;
    if (index < 0) return { filing, index: null, shifted: false };
    return { filing, index, shifted: startOfDay(bars[index].time) !== dayStart };
  });
}

function startOfDay(time: number): number {
  return time - (time % 86_400_000);
}

export function describeFiling(filing: Filing, shifted = false): string {
  const when = `filed ${formatDate(parseDateUTC(filing.filingDate))}`;
  const note = shifted ? ", shown on the next trading session" : "";
  return `FY${filing.fiscalYear} annual report ${when}${note} (period ended ${formatDate(parseDateUTC(filing.periodEnd))})`;
}

/** Markers for the filings that fall inside the series. */
export function filingMarkers(bars: readonly Candle[], filings: readonly Filing[]): ChartMarker[] {
  const markers: ChartMarker[] = [];
  for (const located of locateFilings(bars, filings)) {
    if (located.index === null) continue;
    markers.push({
      index: located.index,
      label: `FY${located.filing.fiscalYear} filing`,
      description: describeFiling(located.filing, located.shifted),
    });
  }
  return markers.sort((a, b) => a.index - b.index);
}

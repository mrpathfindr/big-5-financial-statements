// Candlestick data layer for the price chart.
//
// The repository only ships *daily* OHLCV bars (data/prices/*.json). The chart
// also offers intraday timeframes (5m, 30m, 1h, 3h). Those are derived as
// follows:
//
//   1. For every trading day a deterministic set of 78 five-minute bars (the
//      09:30–16:00 ET regular session) is synthesised INSIDE the day's real
//      envelope: the first bar opens at the daily open, the last bar closes at
//      the daily close, the highest high equals the daily high, the lowest low
//      equals the daily low and the volumes add up to the daily volume.
//   2. Larger intraday timeframes are standard OHLCV resamples of those
//      five-minute bars, anchored at the session open (09:30, 10:30, … for 1h;
//      09:30, 12:30, 15:30 for 3h) — the convention TradingView uses for US
//      equities.
//   3. The daily timeframe uses the raw daily bars, and resampling the 5-minute
//      bars back to one bar per session reproduces them exactly (see
//      tests/candles.test.ts).
//
// The intraday path is therefore a simulation that is consistent with the
// published daily data — not actual tick data — and the UI says so.
//
// Timestamps are stored as UTC epoch milliseconds that encode the *exchange
// wall-clock time* (e.g. Date.UTC(2024, 0, 3, 9, 30) is 09:30 ET on 3 Jan
// 2024). Formatting always uses the UTC time zone, so server and client agree
// and daylight-saving shifts never move bars around.

export type DailyTuple = [
  date: string, // YYYY-MM-DD
  open: number,
  high: number,
  low: number,
  close: number,
  volume: number,
];

export interface Candle {
  time: number; // ms, see note above
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export type TimeframeId = "5m" | "30m" | "1h" | "3h" | "1D";

export interface Timeframe {
  id: TimeframeId;
  label: string;
  /** Bar length in minutes. A full session (390) means one bar per day. */
  minutes: number;
  /** How many bars the chart shows right after selecting the timeframe. */
  defaultVisibleBars: number;
}

export const SESSION_OPEN_MINUTE = 9 * 60 + 30; // 09:30 ET
export const SESSION_LENGTH_MINUTES = 390; // 09:30 -> 16:00
export const BASE_INTERVAL_MINUTES = 5;
const BARS_PER_SESSION = SESSION_LENGTH_MINUTES / BASE_INTERVAL_MINUTES; // 78
const MS_PER_MINUTE = 60_000;
const MS_PER_DAY = 86_400_000;

export const TIMEFRAMES: readonly Timeframe[] = [
  { id: "5m", label: "5m", minutes: 5, defaultVisibleBars: 156 },
  { id: "30m", label: "30m", minutes: 30, defaultVisibleBars: 130 },
  { id: "1h", label: "1h", minutes: 60, defaultVisibleBars: 140 },
  { id: "3h", label: "3h", minutes: 180, defaultVisibleBars: 150 },
  { id: "1D", label: "1D", minutes: SESSION_LENGTH_MINUTES, defaultVisibleBars: 180 },
];

export function getTimeframe(id: TimeframeId): Timeframe {
  const tf = TIMEFRAMES.find((t) => t.id === id);
  if (!tf) throw new Error(`Unknown timeframe "${id}"`);
  return tf;
}

export function isIntraday(tf: Timeframe): boolean {
  return tf.minutes < SESSION_LENGTH_MINUTES;
}

/** Number of bars of this timeframe in one regular session. */
export function barsPerSession(tf: Timeframe): number {
  return Math.ceil(SESSION_LENGTH_MINUTES / tf.minutes);
}

// ---------------------------------------------------------------------------
// Deterministic randomness (same output on the server and in every browser).

/** FNV-1a 32-bit string hash. */
function hashString(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** mulberry32 PRNG: returns a function producing uniform numbers in [0, 1). */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Standard normal sample via Box–Muller. */
function gaussian(rand: () => number): number {
  let u = 0;
  while (u === 0) u = rand(); // avoid log(0)
  const v = rand();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

// ---------------------------------------------------------------------------
// Time helpers

export function parseDateUTC(date: string): number {
  const [y, m, d] = date.split("-").map(Number);
  if (!y || !m || !d) throw new Error(`Invalid date "${date}"`);
  return Date.UTC(y, m - 1, d);
}

function roundCents(x: number): number {
  return Math.round(x * 100) / 100;
}

// ---------------------------------------------------------------------------
// Series construction

/** Daily candles straight from the data file (one bar per trading day). */
export function dailyCandles(daily: readonly DailyTuple[]): Candle[] {
  return daily.map(([date, open, high, low, close, volume]) => ({
    time: parseDateUTC(date),
    open,
    high,
    low,
    close,
    volume,
  }));
}

/**
 * Synthesise the 5-minute bars of one session so that they aggregate exactly
 * to the given daily bar. Pure: the same inputs always give the same bars.
 */
function synthesizeSession(
  dayStart: number,
  open: number,
  high: number,
  low: number,
  close: number,
  volume: number,
  rand: () => number,
  out: Candle[]
): void {
  const n = BARS_PER_SESSION;
  const range = high - low;
  const timeAt = (i: number) => dayStart + (SESSION_OPEN_MINUTE + i * BASE_INTERVAL_MINUTES) * MS_PER_MINUTE;

  // Degenerate day (no range): every bar is flat. Keep volume consistent.
  if (!(range > 0)) {
    const per = Math.floor(volume / n);
    for (let i = 0; i < n; i++) {
      out.push({
        time: timeAt(i),
        open,
        high,
        low,
        close,
        volume: i === n - 1 ? volume - per * (n - 1) : per,
      });
    }
    return;
  }

  // Path of n + 1 prices: path[0] is the session open, path[n] the close, and
  // the daily high/low are pinned at two (distinct) indices. Between the
  // pinned points the path is a Brownian bridge, reflected/clamped into the
  // day's range so the pinned extremes stay the extremes.
  const pickIndex = () => 1 + Math.floor(rand() * (n - 1)); // 1 … n-1
  const iHigh = open === high ? 0 : close === high ? n : pickIndex();
  let iLow = open === low ? 0 : close === low ? n : pickIndex();
  while (iLow === iHigh) iLow = pickIndex(); // only possible when both are random

  const anchors: Array<[index: number, price: number]> = [
    [0, open],
    [iHigh, high],
    [iLow, low],
    [n, close],
  ].sort((a, b) => a[0] - b[0]) as Array<[number, number]>;

  // Per-step volatility: a fraction of the daily range so the bridges wiggle
  // visibly but rarely leave the envelope (excursions are reflected back).
  const sigma = range * 0.05;
  const path = new Array<number>(n + 1);
  path[0] = open;

  for (let a = 0; a < anchors.length - 1; a++) {
    const [ia, va] = anchors[a];
    const [ib, vb] = anchors[a + 1];
    const k = ib - ia;
    if (k <= 0) continue; // coincident anchors (e.g. open === high) share a value
    const walk = new Array<number>(k + 1);
    walk[0] = 0;
    for (let t = 1; t <= k; t++) walk[t] = walk[t - 1] + gaussian(rand) * sigma;
    for (let t = 1; t < k; t++) {
      const f = t / k;
      let x = va + (vb - va) * f + (walk[t] - walk[k] * f);
      if (x > high) x = 2 * high - x;
      if (x < low) x = 2 * low - x;
      // Quote in cents, then clamp: the daily extremes themselves may carry
      // more decimals (split-adjusted data), so clamping must come last.
      path[ia + t] = Math.min(high, Math.max(low, roundCents(x)));
    }
    path[ib] = vb;
  }

  // Volume: U-shaped intraday profile (busy open and close, quiet lunch) with
  // noise, scaled so the bars sum exactly to the daily volume.
  const weights = new Array<number>(n);
  let weightSum = 0;
  for (let i = 0; i < n; i++) {
    const x = (i - (n - 1) / 2) / ((n - 1) / 2); // -1 … 1 across the session
    weights[i] = (0.35 + 1.3 * x * x) * (0.6 + 0.8 * rand());
    weightSum += weights[i];
  }
  const volumes = new Array<number>(n);
  let allocated = 0;
  let heaviest = 0;
  for (let i = 0; i < n; i++) {
    volumes[i] = Math.floor((volume * weights[i]) / weightSum);
    allocated += volumes[i];
    if (weights[i] > weights[heaviest]) heaviest = i;
  }
  volumes[heaviest] += volume - allocated;

  for (let i = 0; i < n; i++) {
    const o = path[i];
    const c = path[i + 1];
    const body = Math.max(o, c);
    const base = Math.min(o, c);
    const wickUp = Math.abs(gaussian(rand)) * sigma * 0.6;
    const wickDown = Math.abs(gaussian(rand)) * sigma * 0.6;
    out.push({
      time: timeAt(i),
      open: o,
      high: Math.max(body, Math.min(high, roundCents(body + wickUp))),
      low: Math.min(base, Math.max(low, roundCents(base - wickDown))),
      close: c,
      volume: volumes[i],
    });
  }
}

/**
 * Deterministic 5-minute bars for every session in `daily`. Each day is seeded
 * from the symbol and date, so a day's bars never change when other days do.
 */
export function synthesizeIntraday(symbol: string, daily: readonly DailyTuple[]): Candle[] {
  const out: Candle[] = [];
  for (const [date, open, high, low, close, volume] of daily) {
    const rand = mulberry32(hashString(`${symbol}|${date}`));
    synthesizeSession(parseDateUTC(date), open, high, low, close, volume, rand, out);
  }
  return out;
}

/** Start of the session-anchored bucket containing `time`. */
function bucketStart(time: number, minutes: number): number {
  const dayStart = time - (time % MS_PER_DAY);
  const offset = (time - dayStart) / MS_PER_MINUTE - SESSION_OPEN_MINUTE;
  const bucket = Math.floor(offset / minutes);
  return dayStart + (SESSION_OPEN_MINUTE + bucket * minutes) * MS_PER_MINUTE;
}

/**
 * Standard OHLCV resampling: open of the first bar, max high, min low, close
 * of the last bar, summed volume. Buckets never cross a session boundary.
 * Input must be sorted by time.
 */
export function resample(bars: readonly Candle[], minutes: number): Candle[] {
  const out: Candle[] = [];
  let current: Candle | null = null;
  for (const bar of bars) {
    const start = bucketStart(bar.time, minutes);
    if (current && current.time === start) {
      current.high = Math.max(current.high, bar.high);
      current.low = Math.min(current.low, bar.low);
      current.close = bar.close;
      current.volume += bar.volume;
    } else {
      current = { ...bar, time: start };
      out.push(current);
    }
  }
  return out;
}

const intradayCache = new WeakMap<readonly DailyTuple[], Map<string, Candle[]>>();

/** Memoised 5-minute base series (≈ 59k bars per symbol; built once). */
export function getIntradayBase(symbol: string, daily: readonly DailyTuple[]): Candle[] {
  let bySymbol = intradayCache.get(daily);
  if (!bySymbol) {
    bySymbol = new Map();
    intradayCache.set(daily, bySymbol);
  }
  let base = bySymbol.get(symbol);
  if (!base) {
    base = synthesizeIntraday(symbol, daily);
    bySymbol.set(symbol, base);
  }
  return base;
}

/**
 * Immutable candle series handed to the chart component.
 *
 * The bars live in a private field on purpose: React's development build
 * deep-diffs changed props for its DevTools performance track, and a bare
 * array of ~59k five-minute candles makes every symbol/timeframe switch stall
 * for seconds in `next dev`. Hiding the array behind the class keeps that
 * instrumentation (and any other naive prop traversal) O(1).
 */
export class CandleSeries {
  readonly #bars: readonly Candle[];

  constructor(bars: readonly Candle[]) {
    this.#bars = bars;
  }

  get bars(): readonly Candle[] {
    return this.#bars;
  }

  get length(): number {
    return this.#bars.length;
  }
}

/** The candle series shown for a symbol at a timeframe. */
export function buildSeries(symbol: string, daily: readonly DailyTuple[], tf: Timeframe): CandleSeries {
  if (!isIntraday(tf)) return new CandleSeries(dailyCandles(daily));
  const base = getIntradayBase(symbol, daily);
  return new CandleSeries(tf.minutes === BASE_INTERVAL_MINUTES ? base : resample(base, tf.minutes));
}

// ---------------------------------------------------------------------------
// Formatting (UTC everywhere — see the note at the top of the file)

const dateFmt = new Intl.DateTimeFormat("en-US", { timeZone: "UTC", month: "short", day: "numeric", year: "numeric" });
const longDateFmt = new Intl.DateTimeFormat("en-US", {
  timeZone: "UTC",
  weekday: "short",
  month: "short",
  day: "numeric",
  year: "numeric",
});
const timeFmt = new Intl.DateTimeFormat("en-US", { timeZone: "UTC", hour: "2-digit", minute: "2-digit", hour12: false });

export function formatDate(time: number): string {
  return dateFmt.format(time);
}

export function formatClock(time: number): string {
  return timeFmt.format(time);
}

/** Crosshair / legend timestamp. */
export function formatBarTime(time: number, intraday: boolean): string {
  return intraday ? `${dateFmt.format(time)} ${timeFmt.format(time)}` : longDateFmt.format(time);
}

export function formatPrice(value: number): string {
  return value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function formatVolume(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1e9) return (value / 1e9).toFixed(2) + "B";
  if (abs >= 1e6) return (value / 1e6).toFixed(2) + "M";
  if (abs >= 1e3) return (value / 1e3).toFixed(1) + "K";
  return String(Math.round(value));
}

export function formatChange(change: number, pct: number): string {
  const sign = change > 0 ? "+" : "";
  return `${sign}${formatPrice(change)} (${sign}${pct.toFixed(2)}%)`;
}

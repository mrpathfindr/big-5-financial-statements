// Run with: npm test (Node >= 22.18 runs TypeScript directly via type stripping).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  BASE_INTERVAL_MINUTES,
  SESSION_LENGTH_MINUTES,
  SESSION_OPEN_MINUTE,
  TIMEFRAMES,
  buildSeries,
  dailyCandles,
  formatBarTime,
  formatVolume,
  getTimeframe,
  parseDateUTC,
  resample,
  synthesizeIntraday,
  type Candle,
  type DailyTuple,
} from "../lib/candles.ts";

const SYMBOLS = ["aapl", "msft", "nvda", "googl", "amzn"] as const;

function loadDaily(symbol: string): DailyTuple[] {
  const file = join(process.cwd(), "data", "prices", `${symbol}_daily_2022_2024.json`);
  const rows = JSON.parse(readFileSync(file, "utf8")) as Array<Record<string, number | string>>;
  return rows.map((r) => [
    r.date as string,
    r.open as number,
    r.high as number,
    r.low as number,
    r.close as number,
    r.volume as number,
  ]);
}

function minuteOfDay(time: number): number {
  return (time % 86_400_000) / 60_000;
}

function assertValidCandle(c: Candle, where: string) {
  assert.ok(c.high >= Math.max(c.open, c.close), `${where}: high below body`);
  assert.ok(c.low <= Math.min(c.open, c.close), `${where}: low above body`);
  assert.ok(c.volume >= 0, `${where}: negative volume`);
  assert.ok(Number.isFinite(c.time), `${where}: bad time`);
}

for (const symbol of SYMBOLS) {
  const daily = loadDaily(symbol);
  const upper = symbol.toUpperCase();

  test(`${upper}: 5-minute bars reproduce every daily bar exactly`, () => {
    const base = synthesizeIntraday(upper, daily);
    assert.equal(base.length, daily.length * (SESSION_LENGTH_MINUTES / BASE_INTERVAL_MINUTES));

    const perDay = resample(base, SESSION_LENGTH_MINUTES);
    assert.equal(perDay.length, daily.length);
    for (let i = 0; i < daily.length; i++) {
      const [date, open, high, low, close, volume] = daily[i];
      const d = perDay[i];
      assert.equal(d.open, open, `${date} open`);
      assert.equal(d.high, high, `${date} high`);
      assert.equal(d.low, low, `${date} low`);
      assert.equal(d.close, close, `${date} close`);
      assert.equal(d.volume, volume, `${date} volume`);
      assert.equal(d.time, parseDateUTC(date) + SESSION_OPEN_MINUTE * 60_000, `${date} bucket start`);
    }
  });

  test(`${upper}: every synthetic bar is a valid candle inside its day's range`, () => {
    const base = synthesizeIntraday(upper, daily);
    const perBar = SESSION_LENGTH_MINUTES / BASE_INTERVAL_MINUTES;
    for (let i = 0; i < base.length; i++) {
      const bar = base[i];
      const [date, , high, low] = daily[Math.floor(i / perBar)];
      assertValidCandle(bar, `${date} bar ${i % perBar}`);
      assert.ok(bar.high <= high && bar.low >= low, `${date} bar ${i % perBar} leaves the daily range`);
      // Contiguous path: each bar opens where the previous one closed.
      if (i % perBar !== 0) assert.equal(bar.open, base[i - 1].close, `${date} bar ${i % perBar} gap`);
      // Generated prices are quoted in cents; only the day's own O/H/L/C
      // (split-adjusted source values) may carry more decimals.
      const [, dOpen, dHigh, dLow, dClose] = daily[Math.floor(i / perBar)];
      for (const v of [bar.open, bar.high, bar.low, bar.close]) {
        const isSource = v === dOpen || v === dHigh || v === dLow || v === dClose;
        assert.ok(isSource || Math.abs(v * 100 - Math.round(v * 100)) < 1e-6, `${date}: ${v} is not a cent value`);
      }
    }
  });
}

test("synthesis is deterministic and depends on the symbol", () => {
  const daily = loadDaily("aapl").slice(0, 20);
  const a = synthesizeIntraday("AAPL", daily);
  const b = synthesizeIntraday("AAPL", daily);
  assert.deepEqual(a, b);
  const other = synthesizeIntraday("MSFT", daily);
  assert.notDeepEqual(a, other);
});

test("a day's bars do not change when other days are added or removed", () => {
  const daily = loadDaily("nvda");
  const perBar = SESSION_LENGTH_MINUTES / BASE_INTERVAL_MINUTES;
  const full = synthesizeIntraday("NVDA", daily).slice(5 * perBar, 6 * perBar);
  const partial = synthesizeIntraday("NVDA", daily.slice(5, 6));
  assert.deepEqual(full, partial);
});

test("every timeframe aggregates the same 5-minute bars consistently", () => {
  const daily = loadDaily("googl").slice(0, 15);
  const base = buildSeries("GOOGL", daily, getTimeframe("5m")).bars;
  const expectedBarsPerDay: Record<string, number> = { "5m": 78, "30m": 13, "1h": 7, "3h": 3 };

  for (const tf of TIMEFRAMES) {
    const series = buildSeries("GOOGL", daily, tf).bars;
    if (tf.id === "1D") {
      assert.deepEqual(series, dailyCandles(daily));
      continue;
    }
    assert.equal(series.length, daily.length * expectedBarsPerDay[tf.id], `${tf.id} bar count`);

    // Session-anchored bucket start times.
    for (const bar of series) {
      const offset = minuteOfDay(bar.time) - SESSION_OPEN_MINUTE;
      assert.ok(offset >= 0 && offset < SESSION_LENGTH_MINUTES, `${tf.id}: bar outside session`);
      assert.equal(offset % tf.minutes, 0, `${tf.id}: bar not anchored to session open`);
    }

    // Each bar must equal the OHLCV of exactly the 5-minute bars it covers.
    for (const bar of series) {
      const end = bar.time + tf.minutes * 60_000;
      const members = base.filter((b) => b.time >= bar.time && b.time < end);
      assert.ok(members.length > 0);
      assert.equal(bar.open, members[0].open);
      assert.equal(bar.close, members[members.length - 1].close);
      assert.equal(bar.high, Math.max(...members.map((m) => m.high)));
      assert.equal(bar.low, Math.min(...members.map((m) => m.low)));
      assert.equal(
        bar.volume,
        members.reduce((s, m) => s + m.volume, 0)
      );
    }
  }
});

test("1h and 3h bars line up with TradingView's session anchoring", () => {
  const daily = loadDaily("amzn").slice(0, 1);
  const h1 = buildSeries("AMZN", daily, getTimeframe("1h")).bars.map((b) => formatBarTime(b.time, true).slice(-5));
  assert.deepEqual(h1, ["09:30", "10:30", "11:30", "12:30", "13:30", "14:30", "15:30"]);
  const h3 = buildSeries("AMZN", daily, getTimeframe("3h")).bars.map((b) => formatBarTime(b.time, true).slice(-5));
  assert.deepEqual(h3, ["09:30", "12:30", "15:30"]);
});

test("CandleSeries exposes its bars without enumerable own properties", () => {
  const series = buildSeries("AAPL", loadDaily("aapl").slice(0, 2), getTimeframe("30m"));
  assert.equal(series.length, 26);
  assert.equal(series.bars.length, 26);
  assert.deepEqual(Object.keys(series), []); // nothing for a naive deep prop diff to walk
});

test("handles the degenerate cases of the envelope", () => {
  // open == high and close == low: extremes are pinned at the session edges
  const bearish: DailyTuple[] = [["2024-03-14", 100, 100, 90, 90, 1000]];
  const bars = synthesizeIntraday("X", bearish);
  assert.equal(bars[0].open, 100);
  assert.equal(bars[bars.length - 1].close, 90);
  assert.equal(Math.max(...bars.map((b) => b.high)), 100);
  assert.equal(Math.min(...bars.map((b) => b.low)), 90);
  assert.equal(
    bars.reduce((s, b) => s + b.volume, 0),
    1000
  );

  // zero range: flat bars, volume still conserved
  const flat: DailyTuple[] = [["2024-03-15", 50, 50, 50, 50, 777]];
  const flatBars = synthesizeIntraday("X", flat);
  assert.ok(flatBars.every((b) => b.open === 50 && b.high === 50 && b.low === 50 && b.close === 50));
  assert.equal(
    flatBars.reduce((s, b) => s + b.volume, 0),
    777
  );
});

test("formatting helpers", () => {
  assert.equal(formatBarTime(Date.UTC(2024, 2, 14, 9, 35), true), "Mar 14, 2024 09:35");
  assert.equal(formatBarTime(Date.UTC(2024, 2, 14), false), "Thu, Mar 14, 2024");
  assert.equal(formatVolume(104_701_220), "104.70M");
  assert.equal(formatVolume(1_500), "1.5K");
  assert.equal(formatVolume(2_100_000_000), "2.10B");
});

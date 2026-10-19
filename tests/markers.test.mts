import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { buildSeries, formatBarTime, getTimeframe, type DailyTuple } from "../lib/candles.ts";
import { describeFiling, filingMarkers, isIsoDate, locateFilings, type Filing } from "../lib/markers.ts";

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

function loadFilings(symbol: string): Filing[] {
  const d = JSON.parse(readFileSync(join(process.cwd(), "data", `${symbol}_financials_2024.json`), "utf8"));
  return [d.priorYear.incomeStatement, d.incomeStatement].map((s) => ({
    fiscalYear: String(s.fiscalYear),
    periodEnd: s.date,
    filingDate: s.filingDate,
  }));
}

test("isIsoDate accepts YYYY-MM-DD only", () => {
  assert.ok(isIsoDate("2024-11-01"));
  assert.ok(!isIsoDate("2024-11-01 06:01:36"));
  assert.ok(!isIsoDate("11/01/2024"));
  assert.ok(!isIsoDate(20241101));
});

test("every statement file yields two filings with YYYY-MM-DD filing dates", () => {
  for (const symbol of ["aapl", "msft", "nvda", "googl", "amzn"]) {
    const filings = loadFilings(symbol);
    assert.equal(filings.length, 2);
    for (const f of filings) {
      assert.ok(isIsoDate(f.filingDate), `${symbol} FY${f.fiscalYear} filingDate`);
      assert.ok(isIsoDate(f.periodEnd), `${symbol} FY${f.fiscalYear} periodEnd`);
      assert.ok(f.filingDate > f.periodEnd, `${symbol}: a report is filed after its period ends`);
    }
  }
});

test("AAPL: both filings land on the exact trading day on every timeframe", () => {
  const daily = loadDaily("aapl");
  const filings = loadFilings("aapl"); // filed 2023-11-03 and 2024-11-01, both Fridays
  for (const id of ["5m", "30m", "1h", "3h", "1D"] as const) {
    const tf = getTimeframe(id);
    const bars = buildSeries("AAPL", daily, tf).bars;
    const markers = filingMarkers(bars, filings);
    assert.equal(markers.length, 2, `${id}: marker count`);
    const times = markers.map((m) => formatBarTime(bars[m.index].time, id !== "1D"));
    if (id === "1D") assert.deepEqual(times, ["Fri, Nov 3, 2023", "Fri, Nov 1, 2024"]);
    else assert.deepEqual(times, ["Nov 3, 2023 09:30", "Nov 1, 2024 09:30"]); // session open of the filing day
    assert.deepEqual(
      markers.map((m) => m.label),
      ["FY2023 filing", "FY2024 filing"]
    );
    for (const located of locateFilings(bars, filings)) assert.equal(located.shifted, false);
  }
});

test("filings after the end of the price history are reported, not plotted", () => {
  const daily = loadDaily("msft");
  const bars = buildSeries("MSFT", daily, getTimeframe("1D")).bars;
  const filings = loadFilings("msft"); // FY2024 filed 2024-07-30 (in range), FY2025 filed 2025-07-30 (after)
  const located = locateFilings(bars, filings);
  assert.equal(located.length, 2);
  assert.equal(daily[located[0].index!][0], "2024-07-30");
  assert.equal(located[1].index, null);
  assert.equal(filingMarkers(bars, filings).length, 1);
});

test("a filing on a non-trading day moves to the next session and says so", () => {
  const daily = loadDaily("googl");
  const bars = buildSeries("GOOGL", daily, getTimeframe("1D")).bars;
  const saturday: Filing = { fiscalYear: "2023", periodEnd: "2023-12-31", filingDate: "2024-02-03" };
  const [located] = locateFilings(bars, [saturday]);
  assert.equal(daily[located.index!][0], "2024-02-05"); // Monday
  assert.equal(located.shifted, true);
  assert.match(describeFiling(saturday, true), /filed Feb 3, 2024, shown on the next trading session/);

  const beforeHistory: Filing = { fiscalYear: "2021", periodEnd: "2021-12-31", filingDate: "2021-02-03" };
  assert.equal(locateFilings(bars, [beforeHistory])[0].index, null);
});

test("describeFiling is human readable", () => {
  assert.equal(
    describeFiling({ fiscalYear: "2024", periodEnd: "2024-09-28", filingDate: "2024-11-01" }),
    "FY2024 annual report filed Nov 1, 2024 (period ended Sep 28, 2024)"
  );
});

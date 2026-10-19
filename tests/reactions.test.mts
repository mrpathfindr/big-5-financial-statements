import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import type { DailyTuple } from "../lib/candles.ts";
import type { Filing } from "../lib/markers.ts";
import { HORIZONS, filingReaction, filingsInYear } from "../lib/reactions.ts";

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

const near = (a: number, b: number, msg?: string) => assert.ok(Math.abs(a - b) < 0.005, `${msg ?? ""} ${a} vs ${b}`);

test("horizons are 1, 5 and 21 trading sessions", () => {
  assert.deepEqual(
    HORIZONS.map((h) => [h.label, h.sessions]),
    [
      ["+1 Day", 1],
      ["+1 Week", 5],
      ["+1 Month", 21],
    ]
  );
});

test("exactly one filing per company was submitted in 2024 and all have price history after them", () => {
  for (const symbol of ["aapl", "msft", "nvda", "googl", "amzn"]) {
    const filings = filingsInYear(loadFilings(symbol), 2024);
    assert.equal(filings.length, 1, symbol);
    const reaction = filingReaction(loadDaily(symbol), filings[0]);
    assert.ok(reaction, symbol);
    assert.equal(reaction.baseDate, filings[0].filingDate, `${symbol}: filed on a trading day`);
    assert.equal(reaction.shifted, false);
    for (const h of reaction.horizons) assert.ok(h.pct !== null, `${symbol} ${h.horizon.label}`);
  }
});

test("NVDA FY2024 (filed 2024-02-21): values match the raw closes", () => {
  const daily = loadDaily("nvda");
  const byDate = new Map(daily.map((r) => [r[0], r[4]]));
  const reaction = filingReaction(daily, { fiscalYear: "2024", periodEnd: "2024-01-28", filingDate: "2024-02-21" })!;
  assert.equal(reaction.baseClose, byDate.get("2024-02-21"));
  const [d1, w1, m1] = reaction.horizons;
  assert.equal(d1.date, "2024-02-22");
  assert.equal(w1.date, "2024-02-28");
  assert.equal(m1.date, "2024-03-21");
  for (const h of [d1, w1, m1]) {
    const close = byDate.get(h.date!)!;
    assert.equal(h.close, close);
    near(h.pct!, (close / reaction.baseClose - 1) * 100, h.horizon.label);
  }
  near(d1.pct!, 16.41, "the well-known post-earnings jump"); // 67.47 -> 78.54
});

test("a filing on a weekend is measured from the next session", () => {
  const daily = loadDaily("amzn");
  const reaction = filingReaction(daily, { fiscalYear: "2023", periodEnd: "2023-12-31", filingDate: "2024-02-03" })!; // Saturday
  assert.equal(reaction.baseDate, "2024-02-05");
  assert.equal(reaction.shifted, true);
  assert.equal(reaction.horizons[0].date, "2024-02-06");
});

test("horizons past the end of the history are null; filings outside it give no reaction", () => {
  const daily = loadDaily("aapl");
  const lastDate = daily[daily.length - 1][0];
  const reaction = filingReaction(daily, { fiscalYear: "2024", periodEnd: "2024-09-28", filingDate: lastDate })!;
  assert.equal(reaction.baseDate, lastDate);
  assert.ok(reaction.horizons.every((h) => h.pct === null && h.close === null && h.date === null));

  assert.equal(filingReaction(daily, { fiscalYear: "2025", periodEnd: "2025-06-30", filingDate: "2025-07-30" }), null);
  assert.equal(filingsInYear(loadFilings("msft"), 2025).length, 1);
  assert.equal(filingsInYear(loadFilings("msft"), 2023).length, 0);
});

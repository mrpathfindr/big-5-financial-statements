"use client";

import { useMemo, useState } from "react";
import CandlestickChart, { defaultView, type ChartView } from "@/components/CandlestickChart";
import TickerSelect from "@/components/TickerSelect";
import {
  TIMEFRAMES,
  buildSeries,
  formatChange,
  formatDate,
  formatPrice,
  getTimeframe,
  isIntraday,
  parseDateUTC,
  type DailyTuple,
  type TimeframeId,
} from "@/lib/candles";
import { describeFiling, filingMarkers, locateFilings, type Filing, type LocatedFiling } from "@/lib/markers";
import type { StockMeta } from "@/lib/prices";

interface Props {
  stocks: StockMeta[];
  prices: Record<string, DailyTuple[]>;
  /** Annual-report filings per symbol, oldest first. */
  filings: Record<string, Filing[]>;
}

const NO_FILINGS: Filing[] = [];

function lastDailyStats(daily: DailyTuple[]) {
  const last = daily[daily.length - 1];
  const prev = daily.length > 1 ? daily[daily.length - 2] : null;
  const close = last[4];
  const reference = prev ? prev[4] : last[1];
  const change = close - reference;
  return { date: last[0], close, change, pct: (change / reference) * 100 };
}

// Price chart panel: symbol picker (top-left), timeframe toggle (top-right),
// price header and the candlestick canvas. Owns which symbol/timeframe is shown
// and the viewport, which resets to the latest bars whenever either changes.
export default function StockChart({ stocks, prices, filings }: Props) {
  const [symbol, setSymbol] = useState(stocks[0].symbol);
  const [timeframeId, setTimeframeId] = useState<TimeframeId>("1D");
  const [view, setView] = useState<ChartView>(() => defaultView(getTimeframe("1D")));

  const stock = stocks.find((s) => s.symbol === symbol) ?? stocks[0];
  const timeframe = getTimeframe(timeframeId);
  const daily = prices[stock.symbol];
  const intraday = isIntraday(timeframe);

  const series = useMemo(() => buildSeries(stock.symbol, daily, timeframe), [stock.symbol, daily, timeframe]);
  const stockFilings = filings[stock.symbol] ?? NO_FILINGS;
  // Only filings that fall inside the price history are listed (and plotted).
  const located = useMemo(
    () =>
      locateFilings(series.bars, stockFilings).filter(
        (l): l is LocatedFiling & { index: number } => l.index !== null
      ),
    [series, stockFilings]
  );
  const markers = useMemo(() => filingMarkers(series.bars, stockFilings), [series, stockFilings]);
  const stats = useMemo(() => lastDailyStats(daily), [daily]);
  const options = useMemo(
    () =>
      stocks.map((s) => {
        const st = lastDailyStats(prices[s.symbol]);
        return {
          ...s,
          detail: formatPrice(st.close),
          subDetail: `${st.pct >= 0 ? "+" : ""}${st.pct.toFixed(2)}%`,
          detailUp: st.change >= 0,
        };
      }),
    [stocks, prices]
  );

  function changeSymbol(next: string) {
    setSymbol(next);
    setView(defaultView(timeframe));
  }

  function changeTimeframe(next: TimeframeId) {
    setTimeframeId(next);
    setView(defaultView(getTimeframe(next)));
  }

  function focusBar(index: number) {
    setView((v) => ({ ...v, focusIndex: index }));
  }

  const up = stats.change >= 0;
  const firstDate = daily.length ? formatDate(parseDateUTC(daily[0][0])) : "";
  const lastDate = formatDate(parseDateUTC(stats.date));

  return (
    <section className="rounded-xl border border-[#e3e5e9] bg-white" aria-label="Price chart">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[#e3e5e9] px-4 pt-3 pb-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <TickerSelect options={options} value={stock.symbol} onChange={changeSymbol} />
            <span className="text-sm text-[#6b7280]">
              {stock.name} · {timeframe.label}
              {intraday && (
                <span
                  className="ml-2 rounded bg-[#fef3c7] px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#92400e]"
                  title="The data set only contains daily bars; intraday candles are simulated inside each day's real open/high/low/close and volume."
                >
                  Simulated intraday
                </span>
              )}
            </span>
          </div>
          <div className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
            <span className="font-mono text-[26px] font-semibold leading-none text-[#1a1d24]">
              {formatPrice(stats.close)}
            </span>
            <span className={`font-mono text-sm font-medium ${up ? "text-[#16a34a]" : "text-[#dc2626]"}`}>
              {formatChange(stats.change, stats.pct)}
            </span>
            <span className="text-xs text-[#6b7280]">USD · close {lastDate}</span>
          </div>
        </div>

        <div
          role="group"
          aria-label="Timeframe"
          className="flex shrink-0 overflow-hidden rounded-lg border border-[#e3e5e9] bg-[#f3f4f6] p-0.5"
        >
          {TIMEFRAMES.map((tf) => {
            const active = tf.id === timeframeId;
            return (
              <button
                key={tf.id}
                type="button"
                aria-pressed={active}
                onClick={() => changeTimeframe(tf.id)}
                className={`rounded-md px-3 py-1 text-[13px] font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2563eb] ${
                  active ? "bg-white text-[#1a1d24] shadow-sm" : "text-[#6b7280] hover:text-[#1a1d24]"
                }`}
              >
                {tf.label}
              </button>
            );
          })}
        </div>
      </div>

      <CandlestickChart
        series={series}
        markers={markers}
        timeframe={timeframe}
        view={view}
        onViewChange={setView}
        ariaLabel={`${stock.symbol} ${timeframe.label} candlestick chart, ${series.length} bars from ${firstDate} to ${lastDate}. Last close ${formatPrice(stats.close)}.`}
      />

      {located.length > 0 && (
        <div
          className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-t border-[#e3e5e9] px-4 py-2 text-[11px] text-[#6b7280]"
          aria-label="Annual report filings"
        >
          <span className="font-medium text-[#1a1d24]">
            <span className="text-[#2563eb]" aria-hidden>
              ▼
            </span>{" "}
            Annual report filed:
          </span>
          {located.map(({ filing, index, shifted }) => (
            <button
              key={filing.filingDate}
              type="button"
              onClick={() => focusBar(index)}
              title={`${describeFiling(filing, shifted)} — click to show on the chart`}
              className="rounded-md border border-[#bfdbfe] bg-[#eff6ff] px-2 py-0.5 font-mono text-[#1d4ed8] hover:bg-[#dbeafe] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2563eb]"
            >
              FY{filing.fiscalYear} · {filing.filingDate}
            </button>
          ))}
        </div>
      )}

      <p className="border-t border-[#e3e5e9] px-4 py-2 text-[11px] leading-relaxed text-[#6b7280]">
        Daily OHLCV {firstDate} – {lastDate}, split-adjusted (Financial Modeling Prep). Intraday timeframes are
        simulated: each session&rsquo;s 5-minute bars are generated inside that day&rsquo;s real open, high, low,
        close and volume, then aggregated (1h/3h bars anchored at the 09:30 ET open). Blue arrows mark the SEC
        filing date of each annual report (from the statement files; on intraday charts the arrow sits on that
        session&rsquo;s first bar). Scroll to zoom, drag to pan, double-click to reset; arrow keys work when the chart
        is focused.
      </p>
    </section>
  );
}

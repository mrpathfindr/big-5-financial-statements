"use client";

import { useState } from "react";
import { formatDate, formatPrice, parseDateUTC } from "@/lib/candles";
import { HORIZONS, type ReactionRow } from "@/lib/reactions";

// Stocks × horizons table: close-to-close % change 1 / 5 / 21 trading sessions
// after the annual report each company filed during the year, measured from
// the filing day's close (the bar the chart's blue arrow sits on). Each horizon
// header is a button that orders the rows by that column: first click highest
// return first, second click lowest first, third click back to the default.

type Direction = "desc" | "asc";

interface Sort {
  horizonId: string;
  direction: Direction;
}

interface Props {
  rows: ReactionRow[];
  year: number;
}

function pctOf(row: ReactionRow, horizonId: string): number | null {
  return row.reaction?.horizons.find((h) => h.horizon.id === horizonId)?.pct ?? null;
}

function sortRows(rows: ReactionRow[], sort: Sort | null): ReactionRow[] {
  if (!sort) return rows;
  const sign = sort.direction === "desc" ? -1 : 1;
  return [...rows].sort((a, b) => {
    const pa = pctOf(a, sort.horizonId);
    const pb = pctOf(b, sort.horizonId);
    if (pa === null && pb === null) return 0;
    if (pa === null) return 1; // rows without data always last
    if (pb === null) return -1;
    return sign * (pa - pb);
  });
}

function pctClass(pct: number): string {
  if (pct > 0) return "text-[#15803d]";
  if (pct < 0) return "text-[#dc2626]";
  return "text-[#1a1d24]";
}

function formatPct(pct: number): string {
  return `${pct > 0 ? "+" : ""}${pct.toFixed(2)}%`;
}

export default function FilingReactionTableView({ rows, year }: Props) {
  const [sort, setSort] = useState<Sort | null>(null);
  const sorted = sortRows(rows, sort);
  const shortDate = (date: string) => formatDate(parseDateUTC(date)).replace(`, ${year}`, "");

  function toggleSort(horizonId: string) {
    setSort((current) => {
      if (current?.horizonId !== horizonId) return { horizonId, direction: "desc" };
      return current.direction === "desc" ? { horizonId, direction: "asc" } : null;
    });
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-[#e3e5e9]">
      <table className="w-full border-collapse whitespace-nowrap bg-white text-sm">
        <caption className="sr-only">
          Share price change after each annual report filed in {year}, one, five and twenty-one trading sessions
          after the filing day, relative to the filing day&rsquo;s close. Column headers sort the rows.
        </caption>
        <thead>
          <tr className="bg-[#f3f4f6] text-[#6b7280]">
            <th scope="col" className="sticky left-0 bg-[#f3f4f6] px-4 py-2.5 text-left font-medium">
              Stock
            </th>
            {HORIZONS.map((h) => {
              const active = sort?.horizonId === h.id;
              const direction = active ? sort.direction : null;
              return (
                <th
                  key={h.id}
                  scope="col"
                  aria-sort={direction === "desc" ? "descending" : direction === "asc" ? "ascending" : "none"}
                  className={`px-2 py-1.5 text-right font-medium ${active ? "text-[#1a1d24]" : ""}`}
                >
                  <button
                    type="button"
                    onClick={() => toggleSort(h.id)}
                    title={
                      direction === "desc"
                        ? `${h.label}: highest return first — click for lowest first`
                        : direction === "asc"
                          ? `${h.label}: lowest return first — click to clear`
                          : `Sort by ${h.label}, highest return first`
                    }
                    className={`ml-auto flex w-full items-center justify-end gap-1.5 rounded-md px-2 py-1 text-right hover:bg-[#e8effd] hover:text-[#1a1d24] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2563eb] ${
                      active ? "bg-[#e8effd]" : ""
                    }`}
                  >
                    <span>
                      {h.label}
                      <span className="block text-[11px] font-normal">
                        {h.sessions === 1 ? "next session" : `${h.sessions} sessions`}
                      </span>
                    </span>
                    <span className="w-3 text-[11px] text-[#2563eb]" aria-hidden>
                      {direction === "desc" ? "▼" : direction === "asc" ? "▲" : "⇅"}
                    </span>
                  </button>
                </th>
              );
            })}
            <th scope="col" className="px-4 py-2.5 text-right font-medium">
              {year} filing
              <span className="block text-[11px] font-normal">annual report · filing-day close</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((row) => (
            <tr key={row.symbol} className="border-t border-[#e3e5e9] hover:bg-[#f5f6f8]">
              <th scope="row" className="sticky left-0 bg-white px-4 py-2.5 text-left font-normal">
                <span className="text-[15px] font-semibold" style={{ color: row.color }}>
                  {row.symbol}
                </span>
                <span className="block text-[11px] text-[#6b7280]">{row.name}</span>
              </th>
              {row.reaction ? (
                <>
                  {row.reaction.horizons.map((h) =>
                    h.pct !== null && h.close !== null && h.date !== null ? (
                      <td
                        key={h.horizon.id}
                        className={`px-4 py-2.5 text-right font-mono font-semibold ${pctClass(h.pct)} ${
                          sort?.horizonId === h.horizon.id ? "bg-[#f3f6fd]" : ""
                        }`}
                        title={`${h.horizon.label}: close ${formatPrice(h.close)} on ${formatDate(parseDateUTC(h.date))}`}
                      >
                        {formatPct(h.pct)}
                        <span className="block text-[11px] font-normal text-[#6b7280]">
                          {formatPrice(h.close)} · {shortDate(h.date)}
                        </span>
                      </td>
                    ) : (
                      <td
                        key={h.horizon.id}
                        className="px-4 py-2.5 text-right text-[#6b7280]"
                        title="Price history ends before this date"
                      >
                        —
                      </td>
                    )
                  )}
                  <td className="px-4 py-2.5 text-right">
                    <span className="text-[#1a1d24]">
                      FY{row.reaction.filing.fiscalYear} · filed {row.reaction.filing.filingDate}
                    </span>
                    <span className="block font-mono text-[11px] text-[#6b7280]">
                      {formatPrice(row.reaction.baseClose)} on {shortDate(row.reaction.baseDate)}
                      {row.reaction.shifted && " (next session)"}
                    </span>
                  </td>
                </>
              ) : (
                <td colSpan={HORIZONS.length + 1} className="px-4 py-2.5 text-[#6b7280]">
                  {row.unavailable.length
                    ? `No price history after the ${year} filing (${row.unavailable.join("; ")})`
                    : `No annual report filed in ${year}`}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

"use client";

import { useState } from "react";
import {
  COMPANIES,
  COMPANY_COLORS,
  METRICS,
  bestCompanyIndex,
  formatMetric,
  type MetricDescriptor,
} from "@/lib/metrics";

// Interactive table: metric rows grouped by category, companies as columns.
// Clicking a rankable metric row reorders the company columns best -> worst.
export default function ComparisonTable() {
  const [order, setOrder] = useState<number[]>(COMPANIES.map((_, i) => i));
  const [sortedBy, setSortedBy] = useState<string | null>(null);

  function sortByMetric(metric: MetricDescriptor) {
    if (metric.higherIsBetter === null) return;
    const dir = metric.higherIsBetter ? -1 : 1;
    setOrder((prev) =>
      [...prev].sort(
        (a, b) =>
          dir *
          ((COMPANIES[a].metrics[metric.key] as number) - (COMPANIES[b].metrics[metric.key] as number))
        )
      );
    setSortedBy(metric.key);
  }

  let lastCategory: string | null = null;

  return (
    <div className="overflow-x-auto rounded-xl border border-[#e3e5e9]">
      <table className="w-full border-collapse whitespace-nowrap bg-white text-sm">
        <thead>
          <tr className="bg-[#f3f4f6]">
            <th className="sticky left-0 bg-[#f3f4f6] px-4 py-2.5 text-left font-medium text-[#6b7280]">
              Metric
            </th>
            {order.map((ci) => {
              const c = COMPANIES[ci];
              return (
                <th key={c.symbol} className="px-4 py-2.5 text-right">
                  <span className="text-[15px] font-semibold" style={{ color: COMPANY_COLORS[ci] }}>
                    {c.symbol}
                  </span>
                  <span className="block text-[11px] font-normal text-[#6b7280]">{c.name}</span>
                  <span className="block text-[11px] font-normal text-[#6b7280]">
                    FY{c.fiscalYear} · ended {c.periodEnd}
                  </span>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {METRICS.map((m) => {
            const rows = [];
            if (m.category !== lastCategory) {
              lastCategory = m.category;
              rows.push(
                <tr key={`cat-${m.category}`}>
                  <td
                    colSpan={COMPANIES.length + 1}
                    className="bg-[#f3f4f6] px-4 py-1.5 text-[11px] uppercase tracking-wider text-[#6b7280]"
                  >
                    {m.category}
                  </td>
                </tr>
              );
            }
            const best = bestCompanyIndex(m);
            const rankable = m.higherIsBetter !== null;
            const isSorted = sortedBy === m.key;
            rows.push(
              <tr
                key={m.key}
                onClick={() => sortByMetric(m)}
                className={`border-t border-[#e3e5e9] ${
                  isSorted ? "bg-[#e8effd] hover:bg-[#dbe7fc]" : "hover:bg-[#f5f6f8]"
                } ${rankable ? "cursor-pointer" : "cursor-default"}`}
                title={rankable ? "Click to rank companies by this metric" : undefined}
              >
                <td className={`sticky left-0 px-4 py-2.5 text-left ${isSorted ? "bg-[#e8effd]" : "bg-white"}`}>
                  {m.label}
                  {isSorted && <span className="ml-1.5 text-[10px] text-[#2563eb]">▼ ranked</span>}
                </td>
                {order.map((ci) => (
                  <td
                    key={ci}
                    className={`px-4 py-2.5 text-right ${
                      ci === best ? "font-semibold text-[#15803d]" : "text-[#1a1d24]"
                    }`}
                  >
                    {formatMetric(COMPANIES[ci].metrics[m.key], m.format)}
                  </td>
                ))}
              </tr>
            );
            return rows;
          })}
        </tbody>
      </table>
    </div>
  );
}

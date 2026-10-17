import ComparisonTable from "@/components/ComparisonTable";
import MetricCharts from "@/components/MetricCharts";
import { CALENDAR_YEAR, COMPANIES } from "@/lib/metrics";

export default function Home() {
  return (
    <main className="mx-auto w-full max-w-6xl px-6 py-10">
      <h1 className="text-[22px] font-semibold text-[#1a1d24]">
        Big Tech FY{CALENDAR_YEAR} — Financial Comparison
      </h1>
      <p className="mb-6 mt-1 text-sm text-[#6b7280]">
        {COMPANIES.length} companies · annual statements overlapping calendar {CALENDAR_YEAR} · data: Financial
        Modeling Prep
      </p>

      <ComparisonTable />
      <p className="mb-10 mt-2 text-sm text-[#6b7280]">
        Click a metric row to rank companies by it. Green = best in row.
      </p>

      <h2 className="mb-3 text-[15px] font-semibold uppercase tracking-wider text-[#6b7280]">Key metrics</h2>
      <MetricCharts />

      <div className="mt-10 max-w-3xl text-xs leading-relaxed text-[#6b7280]">
        <p>
          Fiscal years differ by company (e.g. NVDA FY2025 ended Jan 2025; AAPL FY2024 ended Sep 2024); each
          covers the 12-month period most overlapping calendar {CALENDAR_YEAR}, and growth compares against the
          immediately preceding fiscal year.
        </p>
        <p className="mt-2">
          Valuation multiples use the <em>latest</em> market cap against FY{CALENDAR_YEAR} earnings, so they are
          not point-in-time for {CALENDAR_YEAR}. EV = market cap + total debt − cash &amp; short-term investments.
          ROIC = NOPAT ÷ (equity + debt − cash), NOPAT taxed at each company&rsquo;s effective rate.
        </p>
      </div>
    </main>
  );
}

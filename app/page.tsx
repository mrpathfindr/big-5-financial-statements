import ComparisonTable from "@/components/ComparisonTable";
import FilingReactionTable from "@/components/FilingReactionTable";
import MetricCharts from "@/components/MetricCharts";
import StockChart from "@/components/StockChart";
import { CALENDAR_YEAR, COMPANIES } from "@/lib/metrics";
import { DAILY_PRICES, FILINGS, STOCKS } from "@/lib/prices";

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

      <h2 className="mb-3 text-[15px] font-semibold uppercase tracking-wider text-[#6b7280]">Share price</h2>
      <div className="mb-8">
        <StockChart stocks={STOCKS} prices={DAILY_PRICES} filings={FILINGS} />
      </div>

      <h2 className="mb-3 text-[15px] font-semibold uppercase tracking-wider text-[#6b7280]">
        Price reaction to {CALENDAR_YEAR} filings
      </h2>
      <FilingReactionTable />
      <p className="mb-10 mt-2 text-sm text-[#6b7280]">
        Close-to-close change after each annual report submitted to the SEC in {CALENDAR_YEAR}, measured from the
        close of the filing day (the day marked on the chart): +1 Day = next trading session, +1 Week = 5 sessions,
        +1 Month = 21 sessions. Click a column header to rank the stocks by that return.
      </p>

      <h2 className="mb-3 text-[15px] font-semibold uppercase tracking-wider text-[#6b7280]">Annual statements</h2>
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

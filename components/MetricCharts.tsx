import { COMPANIES, COMPANY_COLORS, CHART_METRICS, METRICS, formatMetric } from "@/lib/metrics";

// Static horizontal bar charts for the headline metrics. Rendered on the
// server; bar widths are proportional to the largest value in each chart.
export default function MetricCharts() {
  return (
    <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
      {CHART_METRICS.map((key) => {
        const m = METRICS.find((x) => x.key === key);
        if (!m) return null;
        const values = COMPANIES.map((c) => c.metrics[key]).filter(
          (v): v is number => v !== null && isFinite(v)
        );
        const max = Math.max(...values);
        return (
          <div key={key} className="rounded-xl border border-[#e3e5e9] bg-white p-4">
            <h3 className="mb-3 text-sm font-semibold text-[#1a1d24]">{m.label}</h3>
            {COMPANIES.map((c, i) => {
              const v = c.metrics[key];
              const pct = max > 0 && v !== null ? Math.max(1, (v / max) * 100) : 0;
              return (
                <div key={c.symbol} className="my-1.5 flex items-center gap-2.5">
                  <div className="w-12 text-right text-xs text-[#6b7280]">{c.symbol}</div>
                  <div className="h-[18px] flex-1 rounded bg-[#eceef1]">
                    <div
                      className="h-full rounded"
                      style={{ width: `${pct}%`, background: COMPANY_COLORS[i], minWidth: 2 }}
                    />
                  </div>
                  <div className="w-[84px] text-xs text-[#1a1d24]">{formatMetric(v, m.format)}</div>
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

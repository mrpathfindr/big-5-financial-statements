import aapl from "@/data/aapl_financials_2024.json";
import msft from "@/data/msft_financials_2024.json";
import nvda from "@/data/nvda_financials_2024.json";
import googl from "@/data/googl_financials_2024.json";
import amzn from "@/data/amzn_financials_2024.json";

// Calculation layer for the comparison dashboard. Mirrors the formulas in
// compute-metrics.js from the fmp-nvda-downloader repo, which produced the
// per-company files in data/ (FMP stable API: annual income statement,
// balance sheet, cash flow statement + quote snapshot).

export type MetricFormat = "percent" | "multiple" | "ratio" | "bigNumber" | "price";

export interface MetricDescriptor {
  key: string;
  label: string;
  category: "Scale" | "Valuation" | "Profitability" | "Growth" | "Health";
  format: MetricFormat;
  // null means informational only: no best-per-row highlight, not rankable
  higherIsBetter: boolean | null;
}

export const METRICS: MetricDescriptor[] = [
  { key: "revenue", label: "Revenue", category: "Scale", format: "bigNumber", higherIsBetter: null },
  { key: "netIncome", label: "Net income", category: "Scale", format: "bigNumber", higherIsBetter: null },
  { key: "ebitda", label: "EBITDA", category: "Scale", format: "bigNumber", higherIsBetter: null },
  { key: "marketCap", label: "Market cap (latest)", category: "Valuation", format: "bigNumber", higherIsBetter: null },
  { key: "peRatio", label: "P / E", category: "Valuation", format: "multiple", higherIsBetter: false },
  { key: "psRatio", label: "P / S", category: "Valuation", format: "multiple", higherIsBetter: false },
  { key: "evToEbitda", label: "EV / EBITDA", category: "Valuation", format: "multiple", higherIsBetter: false },
  { key: "grossMargin", label: "Gross margin", category: "Profitability", format: "percent", higherIsBetter: true },
  { key: "operatingMargin", label: "Operating margin", category: "Profitability", format: "percent", higherIsBetter: true },
  { key: "netMargin", label: "Net margin", category: "Profitability", format: "percent", higherIsBetter: true },
  { key: "roe", label: "Return on equity", category: "Profitability", format: "percent", higherIsBetter: true },
  { key: "roic", label: "Return on invested capital", category: "Profitability", format: "percent", higherIsBetter: true },
  { key: "revenueGrowth", label: "Revenue growth YoY", category: "Growth", format: "percent", higherIsBetter: true },
  { key: "netIncomeGrowth", label: "Net income growth YoY", category: "Growth", format: "percent", higherIsBetter: true },
  { key: "debtToEquity", label: "Debt / equity", category: "Health", format: "ratio", higherIsBetter: false },
  { key: "currentRatio", label: "Current ratio", category: "Health", format: "ratio", higherIsBetter: true },
  { key: "freeCashFlow", label: "Free cash flow", category: "Health", format: "bigNumber", higherIsBetter: true },
  { key: "fcfMargin", label: "FCF margin", category: "Health", format: "percent", higherIsBetter: true },
];

export interface Company {
  symbol: string;
  name: string;
  fiscalYear: string;
  periodEnd: string;
  price: number;
  metrics: Record<string, number | null>;
}

export const CALENDAR_YEAR = 2024;
export const COMPANY_COLORS = ["#2563eb", "#ea580c", "#16a34a", "#9333ea", "#d97706"];
export const CHART_METRICS = ["revenue", "netIncome", "revenueGrowth", "netMargin", "peRatio", "freeCashFlow"];

interface Statement {
  date: string;
  fiscalYear: string;
  [field: string]: unknown;
}

interface FinancialsFile {
  symbol: string;
  quote: { name: string; price: number; marketCap: number };
  incomeStatement: Statement;
  balanceSheet: Statement;
  cashFlowStatement: Statement;
  priorYear: { incomeStatement: Statement };
}

function num(row: Statement, field: string): number {
  const v = row[field];
  if (typeof v !== "number" || !isFinite(v)) {
    throw new Error(`Missing numeric field "${field}" in statement dated ${row.date}`);
  }
  return v;
}

function computeCompany(d: FinancialsFile): Company {
  const inc = d.incomeStatement;
  const bal = d.balanceSheet;
  const cf = d.cashFlowStatement;
  const priorInc = d.priorYear.incomeStatement;
  const marketCap = d.quote.marketCap;

  const taxRate = num(inc, "incomeBeforeTax") > 0 ? num(inc, "incomeTaxExpense") / num(inc, "incomeBeforeTax") : 0;
  const nopat = num(inc, "operatingIncome") * (1 - taxRate);
  const investedCapital =
    num(bal, "totalStockholdersEquity") + num(bal, "totalDebt") - num(bal, "cashAndShortTermInvestments");
  const enterpriseValue = marketCap + num(bal, "totalDebt") - num(bal, "cashAndShortTermInvestments");
  const revenue = num(inc, "revenue");
  const netIncome = num(inc, "netIncome");

  return {
    symbol: d.symbol,
    name: d.quote.name,
    fiscalYear: String(inc.fiscalYear),
    periodEnd: inc.date,
    price: d.quote.price,
    metrics: {
      revenue,
      netIncome,
      ebitda: num(inc, "ebitda"),
      marketCap,
      peRatio: marketCap / netIncome,
      psRatio: marketCap / revenue,
      evToEbitda: enterpriseValue / num(inc, "ebitda"),
      grossMargin: num(inc, "grossProfit") / revenue,
      operatingMargin: num(inc, "operatingIncome") / revenue,
      netMargin: netIncome / revenue,
      roe: netIncome / num(bal, "totalStockholdersEquity"),
      roic: investedCapital > 0 ? nopat / investedCapital : null,
      revenueGrowth: revenue / num(priorInc, "revenue") - 1,
      netIncomeGrowth: netIncome / num(priorInc, "netIncome") - 1,
      debtToEquity: num(bal, "totalDebt") / num(bal, "totalStockholdersEquity"),
      currentRatio: num(bal, "totalCurrentAssets") / num(bal, "totalCurrentLiabilities"),
      freeCashFlow: num(cf, "freeCashFlow"),
      fcfMargin: num(cf, "freeCashFlow") / revenue,
    },
  };
}

export const COMPANIES: Company[] = [
  aapl as unknown as FinancialsFile,
  msft as unknown as FinancialsFile,
  nvda as unknown as FinancialsFile,
  googl as unknown as FinancialsFile,
  amzn as unknown as FinancialsFile,
].map(computeCompany);

export function formatMetric(value: number | null, format: MetricFormat): string {
  if (value === null || value === undefined || !isFinite(value)) return "—";
  switch (format) {
    case "percent":
      return (value * 100).toFixed(1) + "%";
    case "multiple":
      return value.toFixed(1) + "×";
    case "ratio":
      return value.toFixed(2);
    case "price":
      return "$" + value.toFixed(2);
    case "bigNumber": {
      const abs = Math.abs(value);
      const sign = value < 0 ? "−" : "";
      if (abs >= 1e12) return sign + "$" + (abs / 1e12).toFixed(2) + "T";
      if (abs >= 1e9) return sign + "$" + (abs / 1e9).toFixed(1) + "B";
      return sign + "$" + (abs / 1e6).toFixed(0) + "M";
    }
  }
}

// Index into COMPANIES of the best value for a metric, or -1 when the metric
// is informational (higherIsBetter === null).
export function bestCompanyIndex(metric: MetricDescriptor): number {
  if (metric.higherIsBetter === null) return -1;
  let best = -1;
  for (let i = 0; i < COMPANIES.length; i++) {
    const v = COMPANIES[i].metrics[metric.key];
    if (v === null || v === undefined || !isFinite(v)) continue;
    if (best === -1) {
      best = i;
      continue;
    }
    const bv = COMPANIES[best].metrics[metric.key] as number;
    if (metric.higherIsBetter ? v > bv : v < bv) best = i;
  }
  return best;
}

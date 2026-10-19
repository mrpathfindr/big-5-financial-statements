import aapl from "@/data/prices/aapl_daily_2022_2024.json";
import msft from "@/data/prices/msft_daily_2022_2024.json";
import nvda from "@/data/prices/nvda_daily_2022_2024.json";
import googl from "@/data/prices/googl_daily_2022_2024.json";
import amzn from "@/data/prices/amzn_daily_2022_2024.json";
import aaplFinancials from "@/data/aapl_financials_2024.json";
import msftFinancials from "@/data/msft_financials_2024.json";
import nvdaFinancials from "@/data/nvda_financials_2024.json";
import googlFinancials from "@/data/googl_financials_2024.json";
import amznFinancials from "@/data/amzn_financials_2024.json";
import { CALENDAR_YEAR, COMPANIES, COMPANY_COLORS } from "@/lib/metrics";
import type { DailyTuple } from "@/lib/candles";
import { isIsoDate, type Filing } from "@/lib/markers";
import { filingsInYear } from "@/lib/reactions";

// Server-side data for the chart. The raw price files (FMP "historical price
// EOD" rows) are reduced to compact [date, O, H, L, C, V] tuples so that only
// ~40 KB per symbol is serialised into the client component's props, and the
// annual-report filing dates are pulled out of the financial statement files.

export interface StockMeta {
  symbol: string;
  name: string;
  color: string;
}

interface PriceRow {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

function toTuples(symbol: string, rows: PriceRow[]): DailyTuple[] {
  const out: DailyTuple[] = [];
  let previous = "";
  for (const r of rows) {
    const values = [r.open, r.high, r.low, r.close, r.volume];
    if (typeof r.date !== "string" || values.some((v) => typeof v !== "number" || !isFinite(v))) {
      throw new Error(`${symbol}: malformed price row ${JSON.stringify(r)}`);
    }
    if (r.date <= previous) throw new Error(`${symbol}: price rows must be sorted by date (${r.date})`);
    if (r.high < Math.max(r.open, r.close) || r.low > Math.min(r.open, r.close)) {
      throw new Error(`${symbol}: inconsistent OHLC on ${r.date}`);
    }
    previous = r.date;
    out.push([r.date, r.open, r.high, r.low, r.close, r.volume]);
  }
  return out;
}

// Same order and colours as the comparison table so the two stay visually linked.
export const STOCKS: StockMeta[] = COMPANIES.map((c, i) => ({
  symbol: c.symbol,
  name: c.name,
  color: COMPANY_COLORS[i],
}));

export const DAILY_PRICES: Record<string, DailyTuple[]> = {
  AAPL: toTuples("AAPL", aapl),
  MSFT: toTuples("MSFT", msft),
  NVDA: toTuples("NVDA", nvda),
  GOOGL: toTuples("GOOGL", googl),
  AMZN: toTuples("AMZN", amzn),
};

// --- Annual report filings ---------------------------------------------------

interface StatementDates {
  date: string;
  filingDate: string;
  fiscalYear: string;
}

interface FinancialsDates {
  symbol: string;
  incomeStatement: StatementDates;
  priorYear: { incomeStatement: StatementDates };
}

function toFiling(symbol: string, statement: StatementDates): Filing {
  if (!isIsoDate(statement.filingDate) || !isIsoDate(statement.date)) {
    throw new Error(`${symbol}: statement for FY${statement.fiscalYear} lacks a YYYY-MM-DD filingDate/date`);
  }
  return { fiscalYear: String(statement.fiscalYear), periodEnd: statement.date, filingDate: statement.filingDate };
}

/**
 * The annual reports a company submitted to the SEC during calendar
 * CALENDAR_YEAR — the scope of this dashboard — oldest first. Both reports in
 * the statement file (the FY2024-overlapping year and the prior year) are
 * validated, then filtered by filing date; for GOOGL and AMZN that leaves
 * their FY2023 report (filed Jan/Feb 2024), for the others the FY2024 report.
 * The three statements of a report share one filing, so the income
 * statement's dates are used.
 */
function toFilings(d: FinancialsDates): Filing[] {
  const all = [toFiling(d.symbol, d.priorYear.incomeStatement), toFiling(d.symbol, d.incomeStatement)];
  return filingsInYear(all, CALENDAR_YEAR).sort((a, b) => a.filingDate.localeCompare(b.filingDate));
}

/** Filings submitted in CALENDAR_YEAR, per symbol; drives the chart markers and the reaction table. */
export const FILINGS: Record<string, Filing[]> = {
  AAPL: toFilings(aaplFinancials),
  MSFT: toFilings(msftFinancials),
  NVDA: toFilings(nvdaFinancials),
  GOOGL: toFilings(googlFinancials),
  AMZN: toFilings(amznFinancials),
};

for (const s of STOCKS) {
  if (!DAILY_PRICES[s.symbol]?.length) throw new Error(`No price history for ${s.symbol}`);
  if (!FILINGS[s.symbol]?.length) throw new Error(`No filings for ${s.symbol}`);
}

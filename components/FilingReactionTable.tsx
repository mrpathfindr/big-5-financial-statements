import { describeFiling } from "@/lib/markers";
import { CALENDAR_YEAR } from "@/lib/metrics";
import { DAILY_PRICES, FILINGS, STOCKS } from "@/lib/prices";
import { filingReaction, type ReactionRow } from "@/lib/reactions";
import FilingReactionTableView from "@/components/FilingReactionTableView";

// Server side of the reaction table: derives one row per stock from the
// static data (price history + filings submitted in CALENDAR_YEAR) and hands
// the serialisable rows to the client view, which sorts and renders them.

function buildRows(): ReactionRow[] {
  return STOCKS.map((stock) => {
    const filings = FILINGS[stock.symbol] ?? [];
    const reactions = filings.map((f) => ({ f, r: filingReaction(DAILY_PRICES[stock.symbol], f) }));
    // One filing per company per year in this data set; show the latest if there were several.
    const latest = [...reactions].reverse().find((x) => x.r !== null);
    return {
      symbol: stock.symbol,
      name: stock.name,
      color: stock.color,
      reaction: latest?.r ?? null,
      unavailable: reactions.filter((x) => x.r === null).map((x) => describeFiling(x.f)),
    };
  });
}

export default function FilingReactionTable() {
  return <FilingReactionTableView rows={buildRows()} year={CALENDAR_YEAR} />;
}

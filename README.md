This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

## Price chart

The top of the page is a TradingView-style candlestick chart for AAPL, MSFT, NVDA, GOOGL and AMZN:

- **Symbol** — click the ticker label (top-left) to open the list of the other stocks (keyboard: Enter/arrows/Escape).
- **Timeframe** — buttons top-right: `5m`, `30m`, `1h`, `3h`, `1D`.
- **Navigation** — scroll to zoom, drag to pan, double-click to reset; with the chart focused, arrow keys pan/zoom and `End` jumps back to the latest bars. Hovering shows a crosshair with the bar's O/H/L/C, change and volume.
- **Filing marker** — a blue arrow pointing down at the bar of the day the company submitted its annual report to
  the SEC during 2024 (`filingDate`, `YYYY-MM-DD`, read from `data/*_financials_2024.json`; for GOOGL and AMZN
  that is the FY2023 report filed in Jan/Feb 2024, for the others the FY2024 report). Hovering the bar describes
  the filing; the chip under the chart jumps to it. A filing on a non-trading day is shown on the next session, and
  on intraday timeframes the arrow sits on the session's 09:30 bar. Reports filed outside 2024 are out of scope
  and not shown.

### Price reaction table

Below the chart, a stocks × horizons table shows the close-to-close % change **+1 Day** (next trading session),
**+1 Week** (5 sessions) and **+1 Month** (21 sessions) after each annual report submitted to the SEC during
calendar 2024, measured from the close of the filing day — the bar the chart's blue arrow sits on (or the next
session when a filing lands on a non-trading day). The last column lists the filing and the filing-day close.
Each horizon header is a button that orders the rows by that column (highest return first, then lowest first,
then back to the default order). Logic in `lib/reactions.ts`; `components/FilingReactionTable.tsx` builds the
rows on the server and `components/FilingReactionTableView.tsx` sorts and renders them.

### Where the candles come from

`data/prices/*.json` only contains **daily** OHLCV bars (Jan 2022 – Dec 2024, split-adjusted, from Financial Modeling Prep), so:

- **1D** shows those bars as they are.
- **5m / 30m / 1h / 3h** are *simulated*. For every session, 78 five-minute bars are generated deterministically
  inside the day's real envelope — first open = daily open, highest high = daily high, lowest low = daily low,
  last close = daily close, volumes sum to the daily volume — and the larger intraday timeframes are standard
  OHLCV resamples of those 5-minute bars, anchored at the 09:30 ET open (so a 1h chart has bars at 09:30, 10:30,
  …, 15:30 and a 3h chart at 09:30, 12:30, 15:30, as on TradingView). The UI labels these timeframes
  "simulated intraday". Resampling the 5-minute bars back to one bar per day reproduces the source data exactly,
  which the tests assert.

The implementation lives in `lib/candles.ts` (data), `lib/markers.ts` (filing markers), `lib/prices.ts` (server-side loading),
`components/StockChart.tsx` (panel, symbol and timeframe state), `components/TickerSelect.tsx` (dropdown) and
`components/CandlestickChart.tsx` (canvas renderer — no charting library).

## Tests

```bash
npm test
```

Runs the data-layer tests in `tests/` with Node's built-in test runner (Node ≥ 22.18, which executes TypeScript
directly; `tests/register.mjs` resolves the `@/` path alias).

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

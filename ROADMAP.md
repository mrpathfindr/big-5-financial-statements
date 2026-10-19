# Roadmap

1. **Add SEC filing-history links to report markers.** Data: available — each financial statement file includes the company's CIK and filing date, enough to link to its SEC filing history and identify the report date. A direct link to an individual filing document would require an accession number, which is not currently stored.

2. **Show exact 1-day, 1-week, and 1-month price changes beside each result.** Data: available — filing dates plus daily closes support returns after 1, 5, and 21 trading sessions. The reaction table already calculates and displays these periods.

3. **Add filters for company, filing date, and financial metric.** Data: available — the statement files contain company symbols, filing dates, and the financial metrics; the filing dates and symbols are already extracted for the dashboard.

4. **Add a simple filing-based backtest.** Data: available — use each 2024 filing date to simulate buying at the next trading session's open and selling at the close 21 trading sessions later. Show each trade's return and the equal-weighted return across the five stocks; the filing dates and OHLC prices needed for these trades are in the existing files.

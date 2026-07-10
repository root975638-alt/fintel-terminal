/**
 * Curated FRED series catalogue — a small, honestly-documented set of
 * headline US macro indicators. Each entry states what it measures and a
 * known limitation, per spec's "data quality honesty" mandate. FRED itself
 * publishes hundreds of thousands of series; this is a deliberately narrow
 * starting set, not an attempt at comprehensive macro coverage.
 */

export interface MacroSeriesDescriptor {
  readonly seriesId: string; // FRED series ID
  readonly name: string;
  readonly unit: string;
  readonly typicalCadence: "monthly" | "quarterly" | "daily" | "weekly";
  readonly limitation: string;
}

export const MACRO_SERIES_CATALOGUE: readonly MacroSeriesDescriptor[] = [
  {
    seriesId: "GDP",
    name: "US Gross Domestic Product",
    unit: "Billions of Dollars",
    typicalCadence: "quarterly",
    limitation: "Nominal GDP, not inflation-adjusted (use GDPC1 for real GDP); revised multiple times after initial release.",
  },
  {
    seriesId: "CPIAUCSL",
    name: "US Consumer Price Index (All Urban Consumers)",
    unit: "Index 1982-1984=100",
    typicalCadence: "monthly",
    limitation: "Headline CPI includes volatile food/energy prices; core CPI (CPILFESL) excludes them and behaves differently.",
  },
  {
    seriesId: "UNRATE",
    name: "US Unemployment Rate",
    unit: "Percent",
    typicalCadence: "monthly",
    limitation: "U-3 measure only; does not capture underemployment or discouraged workers (see U-6 for a broader measure).",
  },
  {
    seriesId: "FEDFUNDS",
    name: "US Federal Funds Effective Rate",
    unit: "Percent",
    typicalCadence: "monthly",
    limitation: "Effective (realized) rate, not the target range the Fed announces; short lag vs. FOMC decisions.",
  },
  {
    seriesId: "DGS10",
    name: "US 10-Year Treasury Constant Maturity Rate",
    unit: "Percent",
    typicalCadence: "daily",
    limitation: "Business days only; not updated on weekends/holidays (a gap here is expected, not missing data).",
  },
];

export function getSeriesDescriptor(seriesId: string): MacroSeriesDescriptor | undefined {
  return MACRO_SERIES_CATALOGUE.find((s) => s.seriesId === seriesId);
}

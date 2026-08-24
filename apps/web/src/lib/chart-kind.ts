/** Which chart the reader last chose: Usage bucketed into bars, or the running line of Readings. */
export type ChartKind = "bars" | "line";

/** Held in a plain cookie so the server renders the chart the reader last chose, without a flash. */
export const CHART_KIND_COOKIE = "chart";

const YEAR_S = 365 * 24 * 60 * 60;

export function chartKind(value: string | undefined): ChartKind {
  return value === "bars" ? "bars" : "line";
}

export function rememberChartKind(kind: ChartKind): void {
  document.cookie = `${CHART_KIND_COOKIE}=${kind}; path=/; max-age=${YEAR_S}; samesite=lax`;
}

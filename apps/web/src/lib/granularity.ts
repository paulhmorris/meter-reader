/** How wide the periods a chart is bucketed into are. */
export type Granularity = "hour" | "day" | "week" | "month";

/** The window a drill-down fills: a day of hours, a week of days, a month of weeks. */
export const WINDOW: Record<Granularity, Granularity | null> = {
  hour: "day",
  day: "week",
  week: "month",
  month: null,
};

/** What tapping a period opens, or null when there is nothing finer to show. */
export const FINER: Record<Granularity, Granularity | null> = {
  hour: null,
  day: "hour",
  week: "day",
  month: "week",
};

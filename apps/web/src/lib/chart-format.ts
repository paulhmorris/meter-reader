import { WINDOW, type Granularity } from "./granularity.js";

const ZONE = "America/Chicago";

const format = (options: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat(undefined, { timeZone: ZONE, ...options });

const clock = format({ hour: "numeric" });
const timeOfDay = format({ hour: "numeric", minute: "2-digit" });
const dayAndMonth = format({ month: "numeric", day: "numeric" });
const dayNamed = format({ weekday: "short", month: "short", day: "numeric" });
const dayShort = format({ month: "short", day: "numeric" });
const monthShort = format({ month: "short" });
const monthNamed = format({ month: "short", year: "numeric" });

/** What the axis calls a period: short enough that a month of them still fits. */
export function tick(granularity: Granularity, start: Date): string {
  if (granularity === "hour") return clock.format(start);
  if (granularity === "day") return dayAndMonth.format(start);
  if (granularity === "week") return dayShort.format(start);
  return monthShort.format(start);
}

/** What the running line calls a Reading: the time of day it arrived, to the minute. */
export function readingTime(at: Date): string {
  return timeOfDay.format(at);
}

/** What the tooltip calls a period, e.g. "3 PM–4 PM" or "Week of Aug 17". */
export function periodName(
  granularity: Granularity,
  { start, end }: { start: Date; end: Date },
): string {
  if (granularity === "hour") return `${clock.format(start)}–${clock.format(end)}`;
  if (granularity === "day") return dayNamed.format(start);
  if (granularity === "week") return `Week of ${dayShort.format(start)}`;
  return monthNamed.format(start);
}

/** What a view of that granularity covers: the day its hours fill, the month its weeks do. */
export function windowName(granularity: Granularity, at: Date): string {
  const window = WINDOW[granularity];
  // A window is a day, a week or a month, never an hour, so none of them needs a period's end.
  return window === null ? "" : periodName(window, { start: at, end: at });
}

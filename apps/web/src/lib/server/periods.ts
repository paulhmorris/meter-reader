import type { Granularity } from "../granularity.js";

export type { Granularity };

export interface Period {
  start: Date;
  end: Date;
}

const ZONE = "America/Chicago";
const HOUR_MS = 60 * 60 * 1000;

const zoned = new Intl.DateTimeFormat("en-US", {
  timeZone: ZONE,
  hourCycle: "h23",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

interface WallClock {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

function wallClock(instant: Date): WallClock {
  const parts = zoned.formatToParts(instant);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value);

  return {
    year: value("year"),
    month: value("month"),
    day: value("day"),
    hour: value("hour"),
    minute: value("minute"),
    second: value("second"),
  };
}

function offsetMs(instant: Date): number {
  const { year, month, day, hour, minute, second } = wallClock(instant);
  return Date.UTC(year, month - 1, day, hour, minute, second) - instant.getTime();
}

/** The instant a Chicago wall-clock date begins, resolved through whichever offset is in force. */
function atWall(year: number, month: number, day: number): Date {
  const wall = Date.UTC(year, month - 1, day);
  const guess = wall - offsetMs(new Date(wall));
  return new Date(wall - offsetMs(new Date(guess)));
}

function startOfDay(instant: Date): Date {
  const { year, month, day } = wallClock(instant);
  return atWall(year, month, day);
}

/** Weeks run Monday to Monday, the buckets pruning thins to beyond a year (ADR-0003). */
function startOfWeek(instant: Date): Date {
  const { year, month, day } = wallClock(instant);
  const weekday = (new Date(Date.UTC(year, month - 1, day)).getUTCDay() + 6) % 7;
  return atWall(year, month, day - weekday);
}

function startOfMonth(instant: Date): Date {
  const { year, month } = wallClock(instant);
  return atWall(year, month, 1);
}

/** Chicago offsets are whole hours, so an hour of elapsed time is also a local hour boundary. */
function startOfHour(instant: Date): Date {
  return new Date(Math.floor(instant.getTime() / HOUR_MS) * HOUR_MS);
}

/** The start of the period of that granularity holding instant. */
export function startOf(granularity: Granularity, instant: Date): Date {
  if (granularity === "hour") return startOfHour(instant);
  if (granularity === "day") return startOfDay(instant);
  if (granularity === "week") return startOfWeek(instant);
  return startOfMonth(instant);
}

/**
 * The start of the period after the one beginning at start. Counting lands at midday before
 * being snapped back, so a day that gained or lost an hour cannot push the result astray.
 */
export function next(granularity: Granularity, start: Date): Date {
  if (granularity === "hour") return new Date(start.getTime() + HOUR_MS);
  if (granularity === "day") return startOfDay(new Date(start.getTime() + 36 * HOUR_MS));
  if (granularity === "week")
    return startOfDay(new Date(start.getTime() + (7 * 24 + 12) * HOUR_MS));
  return startOfMonth(new Date(start.getTime() + 32 * 24 * HOUR_MS));
}

/**
 * The periods covering from to to, bucketed in America/Chicago, so a spring-forward day holds
 * 23 hours and a fall-back day 25. The period holding to is included while still in progress.
 */
export function periods(
  granularity: Granularity,
  { from, to }: { from: Date; to: Date },
): Period[] {
  const covered: Period[] = [];

  for (let start = startOf(granularity, from); start <= to;) {
    const end = next(granularity, start);
    covered.push({ start, end });
    start = end;
  }

  return covered;
}

/**
 * The start of the Chicago day that many whole days before the one holding instant. Counting back
 * lands at midday, so a day that gained or lost an hour cannot push the result into its neighbour.
 */
export function daysBefore(instant: Date, days: number): Date {
  const midday = startOfDay(instant).getTime() + 12 * HOUR_MS;
  return startOfDay(new Date(midday - days * 24 * HOUR_MS));
}

/** The start of the Chicago month that many whole months before the one holding instant. */
export function monthsBefore(instant: Date, months: number): Date {
  const { year, month } = wallClock(instant);
  return atWall(year, month - months, 1);
}

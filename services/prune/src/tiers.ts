/** How finely Readings of a given age are kept: one per hour, per Chicago day, or per week. */
export type Tier = "hour" | "day" | "week";

export interface TierWindow {
  tier: Tier;
  /** Inclusive. */
  start: Date;
  /** Exclusive. */
  end: Date;
}

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

const RAW_DAYS = 7;
const HOURLY_DAYS = 60;
const DAILY_DAYS = 365;

/** Epoch day 0 was a Thursday, so three days of offset put a week's boundary on the Monday. */
const MONDAY_OFFSET = 3;

const chicago = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Chicago",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** The age ranges a prune thins, youngest first. Readings newer than 7 days are left raw. */
export function tierWindows(now: Date): TierWindow[] {
  const ago = (days: number) => new Date(now.getTime() - days * DAY_MS);

  return [
    { tier: "hour", start: ago(HOURLY_DAYS), end: ago(RAW_DAYS) },
    { tier: "day", start: ago(DAILY_DAYS), end: ago(HOURLY_DAYS) },
    { tier: "week", start: new Date(0), end: ago(DAILY_DAYS) },
  ];
}

function chicagoDayNumber(instant: Date): number {
  const [year, month, day] = chicago.format(instant).split("-").map(Number);
  return Date.UTC(year, month - 1, day) / DAY_MS;
}

/**
 * Which bucket a Reading falls in at that tier. Days and weeks are bucketed in Chicago, as Usage
 * is, so that the Reading kept for a bucket is also the one a day's Usage is measured from.
 */
export function bucketKey(tier: Tier, receivedAt: Date): string {
  if (tier === "hour") return String(Math.floor(receivedAt.getTime() / HOUR_MS));
  if (tier === "day") return chicago.format(receivedAt);
  return String(Math.floor((chicagoDayNumber(receivedAt) + MONDAY_OFFSET) / 7));
}

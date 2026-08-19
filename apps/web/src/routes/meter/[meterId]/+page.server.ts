import { error } from "@sveltejs/kit";
import { vapidPublicKey } from "$lib/server/config.js";
import { prisma } from "$lib/server/db.js";
import { recentEvents } from "$lib/server/events.js";
import { leakIntervals, overlapsLeak, prismaLeakStore } from "$lib/server/leaks.js";
import { latestReading, meterHealth, parseMeterId } from "$lib/server/meter.js";
import { daysBefore } from "$lib/server/periods.js";
import { resolveRange } from "$lib/server/ranges.js";
import { usageByPeriod, type UsagePeriod } from "$lib/server/usage.js";
import { prismaUsageStore } from "$lib/server/usage-store.js";
import type { PageServerLoad } from "./$types.js";

/** Today, plus the seven whole days the average is taken over. */
const HERO_DAYS = 8;
const EVENTS_SHOWN = 50;

export const load: PageServerLoad = async ({ params, url, locals }) => {
  const meterId = parseMeterId(params.meterId);

  // A Meter nobody granted this device is indistinguishable from one that does not exist.
  const allowed = locals.admin || locals.grant?.meterId === meterId;
  if (meterId === null || !allowed) error(404, "Not found");

  const now = new Date();
  const range = resolveRange(url.searchParams, now);
  const usage = { store: prismaUsageStore(prisma()) };
  const [reading, meterEvents, hourly, daily, chart, transitions] = await Promise.all([
    latestReading(prisma(), meterId),
    recentEvents(prisma(), meterId, EVENTS_SHOWN),
    usageByPeriod(usage, {
      meterId,
      granularity: "hour",
      from: daysBefore(now, 0),
      to: now,
    }),
    usageByPeriod(usage, {
      meterId,
      granularity: "day",
      from: daysBefore(now, HERO_DAYS - 1),
      to: now,
    }),
    usageByPeriod(usage, { meterId, ...range }),
    prismaLeakStore(prisma()).activeLeakTransitions(meterId, { from: range.from, to: range.to }),
  ]);

  const leaks = leakIntervals(transitions, { from: range.from, to: range.to });
  const withLeaks = (periods: UsagePeriod[]) =>
    periods.map((period) => ({ ...period, leaking: overlapsLeak(period, leaks) }));

  const health = reading ? meterHealth(reading.receivedAt, now) : null;

  // Only a device holding a Grant can be warned, so the Admin is offered nothing to turn on.
  const pushKey = locals.grant ? vapidPublicKey() : "";

  return {
    meterId: String(meterId),
    reading,
    health,
    ...meterEvents,
    today: hourly.reduce((total, hour) => total + hour.gallons, 0),
    todayPartial: hourly.some((hour) => hour.partial),
    weekAverage: average(daily.slice(0, -1)),
    range,
    chart: withLeaks(chart),
    pushKey,
  };
};

function average(days: UsagePeriod[]): number {
  if (days.length === 0) return 0;
  return days.reduce((total, day) => total + day.gallons, 0) / days.length;
}

import { error } from "@sveltejs/kit";
import { vapidPublicKey } from "$lib/server/config.js";
import { prisma } from "$lib/server/db.js";
import { recentEvents } from "$lib/server/events.js";
import { leakIntervals, overlapsLeak, prismaLeakStore } from "$lib/server/leaks.js";
import { latestReading, meterHealth, parseMeterId } from "$lib/server/meter.js";
import { daysBefore } from "$lib/server/periods.js";
import { usageByPeriod, type UsagePeriod } from "$lib/server/usage.js";
import { prismaUsageStore } from "$lib/server/usage-store.js";
import type { PageServerLoad } from "./$types.js";

const DAYS_SHOWN = 30;
const EVENTS_SHOWN = 50;

export const load: PageServerLoad = async ({ params, locals }) => {
  const meterId = parseMeterId(params.meterId);

  // A Meter nobody granted this device is indistinguishable from one that does not exist.
  const allowed = locals.admin || locals.grant?.meterId === meterId;
  if (meterId === null || !allowed) error(404, "Not found");

  const now = new Date();
  const windowStart = daysBefore(now, DAYS_SHOWN - 1);
  const usage = { store: prismaUsageStore(prisma()) };
  const [reading, meterEvents, hourly, daily, transitions] = await Promise.all([
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
      from: windowStart,
      to: now,
    }),
    prismaLeakStore(prisma()).activeLeakTransitions(meterId, { from: windowStart, to: now }),
  ]);

  const leaks = leakIntervals(transitions, { from: windowStart, to: now });
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
    hourly: withLeaks(hourly),
    daily: withLeaks(daily),
    pushKey,
  };
};

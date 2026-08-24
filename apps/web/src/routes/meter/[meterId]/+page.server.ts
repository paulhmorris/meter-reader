import { error } from "@sveltejs/kit";
import { chartKind, CHART_KIND_COOKIE } from "$lib/chart-kind.js";
import { vapidPublicKey } from "$lib/server/config.js";
import { prisma } from "$lib/server/db.js";
import { recentEvents } from "$lib/server/events.js";
import { leakIntervals, overlapsLeak, prismaLeakStore } from "$lib/server/leaks.js";
import { latestReading, meterHealth, parseMeterId } from "$lib/server/meter.js";
import { resolveRange } from "$lib/server/ranges.js";
import { runningUsage, usageByPeriod, type UsagePeriod } from "$lib/server/usage.js";
import { prismaUsageStore } from "$lib/server/usage-store.js";
import type { PageServerLoad } from "./$types.js";

const EVENTS_SHOWN = 50;

export const load: PageServerLoad = async ({ params, url, locals, cookies }) => {
  const meterId = parseMeterId(params.meterId);

  // A Meter nobody granted this device is indistinguishable from one that does not exist.
  const allowed = locals.admin || locals.grant?.meterId === meterId;
  if (meterId === null || !allowed) error(404, "Not found");

  const now = new Date();
  const range = resolveRange(url.searchParams, now);
  const usage = { store: prismaUsageStore(prisma()) };

  // A day holds a Reading every quarter of an hour, which is few enough to plot one by one; a
  // month or a year of them is not, so only Today is offered the running line.
  const running = range.preset === "today" && !range.drilled;

  const [reading, meterEvents, chart, transitions, trace] = await Promise.all([
    latestReading(prisma(), meterId),
    recentEvents(prisma(), meterId, EVENTS_SHOWN),
    usageByPeriod(usage, { meterId, ...range }),
    prismaLeakStore(prisma()).activeLeakTransitions(meterId, { from: range.from, to: range.to }),
    running ? runningUsage(usage, { meterId, from: range.from, to: range.to }) : null,
  ]);

  const leaks = leakIntervals(transitions, { from: range.from, to: range.to });
  const withLeaks = (periods: UsagePeriod[]) =>
    periods.map((period) => ({ ...period, leaking: overlapsLeak(period, leaks) }));

  const health = reading ? meterHealth(reading.receivedAt, now) : null;

  // Only a device holding a Grant can be warned, so the Admin is offered nothing to turn on.
  const pushKey = locals.grant ? vapidPublicKey() : "";

  return {
    meterId: String(meterId),
    /** An Admin reading a neighbour's page is offered the way back to their own view of it. */
    admin: locals.admin,
    reading,
    health,
    ...meterEvents,
    range,
    chart: withLeaks(chart),
    /** The running line's points, or null on a stretch too wide to plot Reading by Reading. */
    trace,
    chartKind: chartKind(cookies.get(CHART_KIND_COOKIE)),
    pushKey,
  };
};

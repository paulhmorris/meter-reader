import { error } from "@sveltejs/kit";
import { prisma } from "$lib/server/db.js";
import { latestReading, parseMeterId } from "$lib/server/meter.js";
import { daysBefore } from "$lib/server/periods.js";
import { usageByPeriod } from "$lib/server/usage.js";
import { prismaUsageStore } from "$lib/server/usage-store.js";
import type { PageServerLoad } from "./$types.js";

const DAYS_SHOWN = 30;

export const load: PageServerLoad = async ({ params, locals }) => {
  const meterId = parseMeterId(params.meterId);

  // A Meter nobody granted this device is indistinguishable from one that does not exist.
  if (meterId === null || locals.grant?.meterId !== meterId) error(404, "Not found");

  const now = new Date();
  const usage = { store: prismaUsageStore(prisma()) };
  const [reading, hourly, daily] = await Promise.all([
    latestReading(prisma(), meterId),
    usageByPeriod(usage, {
      meterId,
      granularity: "hour",
      from: daysBefore(now, 0),
      to: now,
    }),
    usageByPeriod(usage, {
      meterId,
      granularity: "day",
      from: daysBefore(now, DAYS_SHOWN - 1),
      to: now,
    }),
  ]);

  return { meterId: String(meterId), reading, hourly, daily };
};

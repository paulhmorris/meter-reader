import { error } from "@sveltejs/kit";
import { prisma } from "$lib/server/db.js";
import { latestReading, parseMeterId } from "$lib/server/meter.js";
import type { PageServerLoad } from "./$types.js";

export const load: PageServerLoad = async ({ params, locals }) => {
  const meterId = parseMeterId(params.meterId);

  // A Meter nobody granted this device is indistinguishable from one that does not exist.
  if (meterId === null || locals.grant?.meterId !== meterId) error(404, "Not found");

  return {
    meterId: String(meterId),
    reading: await latestReading(prisma(), meterId),
  };
};

import { meterSummaries } from "$lib/server/admin.js";
import { prismaAdminStore } from "$lib/server/admin-store.js";
import { prisma } from "$lib/server/db.js";
import type { PageServerLoad } from "./$types.js";

export const load: PageServerLoad = async () => {
  const meters = await meterSummaries(prismaAdminStore(prisma()), new Date());

  return {
    meters: meters.map((meter) => ({ ...meter, id: String(meter.id) })),
  };
};

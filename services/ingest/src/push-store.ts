import type { PrismaClient } from "@meter-reader/db";
import type { PushEndpointStore } from "./warn.js";

/** Backs the PushEndpointStore with Postgres, where a revoked Grant's endpoints are simply unseen. */
export function prismaPushEndpointStore(prisma: PrismaClient): PushEndpointStore {
  return {
    async liveEndpoints(meterId) {
      return prisma.pushEndpoint.findMany({
        where: { grant: { meterId, revokedAt: null } },
        select: { id: true, endpoint: true, p256dh: true, auth: true },
      });
    },

    async forget(id) {
      await prisma.pushEndpoint.deleteMany({ where: { id } });
    },
  };
}

import type { PrismaClient } from "@meter-reader/db";
import type { PushStore } from "./push.js";

export function prismaPushStore(prisma: PrismaClient): PushStore {
  return {
    async hold(grantId, { endpoint, p256dh, auth }) {
      await prisma.pushEndpoint.upsert({
        where: { grantId_endpoint: { grantId, endpoint } },
        create: { grantId, endpoint, p256dh, auth },
        update: { p256dh, auth },
      });
    },

    async drop(grantId, endpoint) {
      await prisma.pushEndpoint.deleteMany({ where: { grantId, endpoint } });
    },
  };
}

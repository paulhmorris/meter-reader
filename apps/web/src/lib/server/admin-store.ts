import type { PrismaClient } from "@meter-reader/db";
import type { AdminStore } from "./admin.js";

export function prismaAdminStore(prisma: PrismaClient): AdminStore {
  return {
    async hasMeter(meterId) {
      const meter = await prisma.meter.findUnique({ where: { id: meterId }, select: { id: true } });
      return meter !== null;
    },

    async meters() {
      const meters = await prisma.meter.findMany({
        orderBy: { id: "asc" },
        select: {
          id: true,
          readings: {
            orderBy: [{ receivedAt: "desc" }, { id: "desc" }],
            take: 1,
            select: { receivedAt: true, activeLeak: true },
          },
        },
      });

      return meters.map(({ id, readings }) => ({ id, latest: readings[0] ?? null }));
    },

    async activeClaimCode(meterId) {
      return prisma.claimCode.findFirst({
        where: { meterId, rotatedAt: null },
        orderBy: { createdAt: "desc" },
        select: { createdAt: true },
      });
    },

    async rotateClaimCode({ meterId, code, now }) {
      // Serializable, so two rotations at once cannot both leave a claimable code behind.
      await prisma.$transaction(
        async (tx) => {
          await tx.claimCode.updateMany({
            where: { meterId, rotatedAt: null },
            data: { rotatedAt: now },
          });
          await tx.claimCode.create({ data: { code, meterId, createdAt: now } });
        },
        { isolationLevel: "Serializable" },
      );
    },

    async grants(meterId) {
      return prisma.grant.findMany({
        where: { meterId, revokedAt: null },
        orderBy: { createdAt: "desc" },
        select: { id: true, createdAt: true, device: true },
      });
    },

    async revokeGrant({ grantId, meterId, now }) {
      const revoked = await prisma.grant.updateMany({
        where: { id: grantId, meterId, revokedAt: null },
        data: { revokedAt: now },
      });
      return revoked.count > 0;
    },
  };
}

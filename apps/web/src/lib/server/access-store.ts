import type { PrismaClient } from "@meter-reader/db";
import type { AccessStore } from "./access.js";

export function prismaAccessStore(prisma: PrismaClient): AccessStore {
  return {
    async meterForClaimCode(code) {
      const claimCode = await prisma.claimCode.findFirst({
        where: { code, rotatedAt: null },
        select: { meterId: true },
      });
      return claimCode?.meterId ?? null;
    },

    async createGrant({ meterId, claimCode, device, now }) {
      const grant = await prisma.grant.create({
        data: { meterId, claimCode, device, createdAt: now },
        select: { id: true },
      });
      return grant.id;
    },

    async activeGrant(grantId) {
      return prisma.grant.findFirst({
        where: { id: grantId, revokedAt: null },
        select: { id: true, meterId: true },
      });
    },
  };
}

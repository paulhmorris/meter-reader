import type { PrismaClient } from "@meter-reader/db";
import type { PruneStore, ReadingCursor } from "./prune.js";

function after(cursor: ReadingCursor | null) {
  if (cursor === null) return {};
  return {
    OR: [
      { receivedAt: { gt: cursor.receivedAt } },
      { receivedAt: cursor.receivedAt, id: { gt: cursor.id } },
    ],
  };
}

/** Backs the PruneStore with Postgres. It reads and deletes Readings, and nothing else. */
export function prismaPruneStore(prisma: PrismaClient): PruneStore {
  return {
    async meterIds() {
      const meters = await prisma.meter.findMany({ select: { id: true }, orderBy: { id: "asc" } });
      return meters.map((meter) => meter.id);
    },

    async readingsInWindow(meterId, window, cursor, limit) {
      return prisma.reading.findMany({
        where: {
          meterId,
          receivedAt: { gte: window.start, lt: window.end },
          ...after(cursor),
        },
        orderBy: [{ receivedAt: "asc" }, { id: "asc" }],
        take: limit,
        select: { id: true, receivedAt: true },
      });
    },

    async deleteReadings(ids) {
      const { count } = await prisma.reading.deleteMany({ where: { id: { in: ids } } });
      return count;
    },
  };
}

import type { PrismaClient } from "@meter-reader/db";
import type { ReadingStore } from "./record.js";

/** Backs the ReadingStore with Postgres, creating the Meter the first time it is heard from. */
export function prismaReadingStore(prisma: PrismaClient): ReadingStore {
  return {
    async lastConsumption(meterId) {
      const last = await prisma.reading.findFirst({
        where: { meterId },
        orderBy: [{ receivedAt: "desc" }, { id: "desc" }],
        select: { consumption: true },
      });
      return last ? last.consumption.toString() : null;
    },

    async save(reading, receivedAt) {
      await prisma.$transaction([
        prisma.meter.upsert({
          where: { id: reading.meterId },
          create: { id: reading.meterId },
          update: {},
        }),
        prisma.reading.create({
          data: { meterId: reading.meterId, consumption: reading.consumption, receivedAt },
        }),
      ]);
    },
  };
}

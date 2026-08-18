import type { PrismaClient } from "@meter-reader/db";
import type { ReadingStore } from "./record.js";

/** Backs the ReadingStore with Postgres, creating the Meter the first time it is heard from. */
export function prismaReadingStore(prisma: PrismaClient): ReadingStore {
  return {
    async lastReading(meterId) {
      const last = await prisma.reading.findFirst({
        where: { meterId },
        orderBy: [{ receivedAt: "desc" }, { id: "desc" }],
        select: {
          consumption: true,
          activeLeak: true,
          leakHistory: true,
          backflow: true,
          noUse: true,
          receivedAt: true,
        },
      });
      if (!last) return null;

      return {
        consumption: last.consumption.toFixed(1),
        flags: {
          activeLeak: last.activeLeak,
          leakHistory: last.leakHistory,
          backflow: last.backflow,
          noUse: last.noUse,
        },
        receivedAt: last.receivedAt,
      };
    },

    async save(reading, receivedAt) {
      await prisma.$transaction([
        prisma.meter.upsert({
          where: { id: reading.meterId },
          create: { id: reading.meterId },
          update: {},
        }),
        prisma.reading.create({
          data: {
            meterId: reading.meterId,
            consumption: reading.consumption,
            activeLeak: reading.flags.activeLeak,
            leakHistory: reading.flags.leakHistory,
            backflow: reading.flags.backflow,
            noUse: reading.flags.noUse,
            receivedAt,
          },
        }),
      ]);
    },
  };
}

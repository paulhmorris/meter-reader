import { Prisma, type PrismaClient } from "@meter-reader/db";
import type { MeterReading } from "./meter.js";
import type { UsageStore } from "./usage.js";

interface BoundaryRow {
  consumption: number | null;
  receivedAt: Date | null;
}

export function prismaUsageStore(prisma: PrismaClient): UsageStore {
  return {
    async lastReadingBefore(meterId, instants) {
      const rows = await prisma.$queryRaw<BoundaryRow[]>`
        SELECT r.consumption::float8 AS "consumption", r."receivedAt"
        FROM unnest(ARRAY[${Prisma.join(instants)}]::timestamptz[]) WITH ORDINALITY AS b(instant, ord)
        LEFT JOIN LATERAL (
          SELECT consumption, "receivedAt"
          FROM "Reading"
          WHERE "meterId" = ${meterId} AND "receivedAt" < b.instant
          ORDER BY "receivedAt" DESC, id DESC
          LIMIT 1
        ) r ON true
        ORDER BY b.ord
      `;

      return rows.map<MeterReading | null>((row) =>
        row.consumption === null || row.receivedAt === null
          ? null
          : { consumption: row.consumption, receivedAt: row.receivedAt },
      );
    },
  };
}

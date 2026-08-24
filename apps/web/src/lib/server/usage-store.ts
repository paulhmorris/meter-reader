import { Prisma, type PrismaClient } from "@meter-reader/db";
import type { MeterReading } from "./meter.js";
import type { Boundary, TracedReading, UsageStore } from "./usage.js";

interface BoundaryRow {
  beforeConsumption: number | null;
  beforeReceivedAt: Date | null;
  fromConsumption: number | null;
  fromReceivedAt: Date | null;
}

function reading(consumption: number | null, receivedAt: Date | null): MeterReading | null {
  return consumption === null || receivedAt === null ? null : { consumption, receivedAt };
}

interface ReadingRow {
  consumption: Prisma.Decimal;
  receivedAt: Date;
  activeLeak: number;
}

function traced(row: ReadingRow): TracedReading {
  return {
    consumption: row.consumption.toNumber(),
    receivedAt: row.receivedAt,
    leaking: row.activeLeak > 0,
  };
}

export function prismaUsageStore(prisma: PrismaClient): UsageStore {
  return {
    async boundaryReadings(meterId, instants) {
      const rows = await prisma.$queryRaw<BoundaryRow[]>`
        SELECT
          b1.consumption::float8 AS "beforeConsumption",
          b1."receivedAt" AS "beforeReceivedAt",
          a1.consumption::float8 AS "fromConsumption",
          a1."receivedAt" AS "fromReceivedAt"
        FROM unnest(ARRAY[${Prisma.join(instants)}]::timestamptz[]) WITH ORDINALITY AS b(instant, ord)
        LEFT JOIN LATERAL (
          SELECT consumption, "receivedAt"
          FROM "Reading"
          WHERE "meterId" = ${meterId} AND "receivedAt" < b.instant
          ORDER BY "receivedAt" DESC, id DESC
          LIMIT 1
        ) b1 ON true
        LEFT JOIN LATERAL (
          SELECT consumption, "receivedAt"
          FROM "Reading"
          WHERE "meterId" = ${meterId} AND "receivedAt" >= b.instant
          ORDER BY "receivedAt" ASC, id ASC
          LIMIT 1
        ) a1 ON true
        ORDER BY b.ord
      `;

      return rows.map<Boundary>((row) => ({
        before: reading(row.beforeConsumption, row.beforeReceivedAt),
        from: reading(row.fromConsumption, row.fromReceivedAt),
      }));
    },

    async readingsIn(meterId, { from, to }) {
      const [opening, readings] = await Promise.all([
        prisma.reading.findFirst({
          where: { meterId, receivedAt: { lt: from } },
          orderBy: [{ receivedAt: "desc" }, { id: "desc" }],
          select: { consumption: true, receivedAt: true, activeLeak: true },
        }),
        prisma.reading.findMany({
          where: { meterId, receivedAt: { gte: from, lte: to } },
          orderBy: [{ receivedAt: "asc" }, { id: "asc" }],
          select: { consumption: true, receivedAt: true, activeLeak: true },
        }),
      ]);

      return { opening: opening && traced(opening), readings: readings.map(traced) };
    },
  };
}

import type { PrismaClient } from "@meter-reader/db";
import type { AdminStore, MeterStats } from "./admin.js";

const DAY_MS = 24 * 60 * 60 * 1000;

/** One Meter with its latest Reading flattened alongside it, every Reading column null while it has none. */
interface MeterRow {
  id: bigint;
  receivedAt: Date | null;
  consumption: number | null;
  activeLeak: number | null;
  leakHistory: number | null;
  backflow: number | null;
  noUse: number | null;
  consumptionBefore: number | null;
  readings: number;
  rssi: number | null;
  snr: number | null;
  devices: number;
}

/** The Reading columns come back null together, the Meter having none, so one of them decides. */
function latestOf(row: MeterRow): MeterStats["latest"] {
  if (row.receivedAt === null) return null;

  return {
    receivedAt: row.receivedAt,
    consumption: Number(row.consumption),
    activeLeak: Number(row.activeLeak),
    leakHistory: Number(row.leakHistory),
    backflow: Number(row.backflow),
    noUse: Number(row.noUse),
  };
}

export function prismaAdminStore(prisma: PrismaClient): AdminStore {
  return {
    async hasMeter(meterId) {
      const meter = await prisma.meter.findUnique({ where: { id: meterId }, select: { id: true } });
      return meter !== null;
    },

    async meters(now) {
      const since = new Date(now.getTime() - DAY_MS);

      const rows = await prisma.$queryRaw<MeterRow[]>`
        SELECT
          m.id,
          l."receivedAt",
          l.consumption::float8 AS "consumption",
          l."activeLeak",
          l."leakHistory",
          l."backflow",
          l."noUse",
          prior.consumption::float8 AS "consumptionBefore",
          heard.readings,
          heard.rssi,
          heard.snr,
          devices.count AS "devices"
        FROM "Meter" m
        LEFT JOIN LATERAL (
          SELECT "receivedAt", consumption, "activeLeak", "leakHistory", "backflow", "noUse"
          FROM "Reading"
          WHERE "meterId" = m.id
          ORDER BY "receivedAt" DESC, id DESC
          LIMIT 1
        ) l ON true
        LEFT JOIN LATERAL (
          SELECT consumption
          FROM "Reading"
          WHERE "meterId" = m.id AND "receivedAt" < ${since}
          ORDER BY "receivedAt" DESC, id DESC
          LIMIT 1
        ) prior ON true
        LEFT JOIN LATERAL (
          SELECT
            count(*)::int AS readings,
            avg(rssi)::float8 AS rssi,
            avg(snr)::float8 AS snr
          FROM "Reading"
          WHERE "meterId" = m.id AND "receivedAt" >= ${since}
        ) heard ON true
        LEFT JOIN LATERAL (
          SELECT count(*)::int AS count
          FROM "Grant"
          WHERE "meterId" = m.id AND "revokedAt" IS NULL
        ) devices ON true
        ORDER BY m.id ASC
      `;

      return rows.map((row) => ({
        id: row.id,
        latest: latestOf(row),
        consumptionBefore: row.consumptionBefore,
        readings: row.readings,
        rssi: row.rssi,
        snr: row.snr,
        devices: row.devices,
      }));
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

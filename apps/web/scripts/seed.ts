import { createPrismaClient } from "@meter-reader/db";
import { formatClaimCode, generateClaimCode } from "../src/lib/server/claim-code.js";

const METER_ID = 1_234_567_890n;

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

/** How far back Readings go, so the 12-month preset has whole months either side of today. */
const SEEDED_DAYS = 400;
/** What pruning would have left behind at each age (ADR-0003), so Partial reads as it will live. */
const RAW_DAYS = 7;
const HOURLY_DAYS = 60;

/** A household's day: quiet at night, a shower in the morning, dishes and laundry in the evening. */
const HOURLY_GALLONS = [
  0, 0, 0, 0, 0, 1.2, 18.4, 9.6, 2.1, 0.4, 6.8, 1.5, 3.2, 0.8, 0, 2.4, 11.7, 24.3, 7.9, 4.6, 12.1,
  3.4, 0.6, 0,
];

/** The stretch the receiver was down for. Over a day long, so it takes a midnight with it. */
const GAP_FROM_DAYS = 2.95;
const GAP_TO_DAYS = 1.9;

/** The stretch the meter reported an intermittent Active Leak, on top of the usual pattern. */
const LEAK_FROM_DAYS = 4.4;
const LEAK_TO_DAYS = 3.2;
const LEAK_GALLONS_PER_HOUR = 9;

interface SeedReading {
  consumption: number;
  activeLeak: number;
  receivedAt: Date;
}

const ZONE = "America/Chicago";
const STEP_MS = 15 * MINUTE_MS;

const chicagoDate = new Intl.DateTimeFormat("en-CA", {
  timeZone: ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});
const chicagoHour = new Intl.DateTimeFormat("en-US", {
  timeZone: ZONE,
  hour: "numeric",
  hourCycle: "h23",
});

const prisma = createPrismaClient();

const now = Date.now();
const ago = (days: number) => now - days * DAY_MS;
const leaking = (at: number) => at >= ago(LEAK_FROM_DAYS) && at < ago(LEAK_TO_DAYS);
const silent = (at: number) => at >= ago(GAP_FROM_DAYS) && at < ago(GAP_TO_DAYS);

/**
 * Which of the quarter-hourly Readings the nightly prune would have left: all of them for a week,
 * then the last of each hour, then the last of each Chicago day. Keeping the *last* is what makes
 * a pruned period's Usage exact (ADR-0003), so seeding any other Reading of the bucket would show
 * Partial periods the real thing never has.
 */
function survivesPruning(at: number): boolean {
  if (at >= ago(RAW_DAYS)) return true;
  if (at >= ago(HOURLY_DAYS)) return new Date(at + STEP_MS).getUTCMinutes() === 0;
  return chicagoDate.format(at) !== chicagoDate.format(at + STEP_MS);
}

/** Gallons used in the hour holding an instant, varied by weekday so no two weeks look alike. */
function gallonsPerHour(at: number): number {
  const weekday = new Date(`${chicagoDate.format(at)}T00:00:00Z`).getUTCDay();
  const shape = HOURLY_GALLONS[Number(chicagoHour.format(at))];
  return shape * (weekday === 0 || weekday === 6 ? 1.35 : 0.9 + (weekday % 3) * 0.12);
}

/**
 * Readings back to SEEDED_DAYS: water is used quarter-hourly throughout, but only the Readings a
 * prune would have spared are stored, along with a stretch the receiver missed and one the meter
 * called a leak. Consumption only ever climbs.
 */
function readings(): SeedReading[] {
  const seeded: SeedReading[] = [];
  let consumption = 481_320.5;

  // Aligned to the hour, so the Reading a prune would keep is the one at a quarter to.
  const start = Math.floor(ago(SEEDED_DAYS) / STEP_MS) * STEP_MS;
  const perStep = STEP_MS / HOUR_MS;

  for (let at = start; at <= now; at += STEP_MS) {
    consumption += (gallonsPerHour(at) + (leaking(at) ? LEAK_GALLONS_PER_HOUR : 0)) * perStep;

    if (silent(at) || !survivesPruning(at)) continue;

    seeded.push({
      consumption: Math.round(consumption * 10) / 10,
      activeLeak: leaking(at) ? 1 : 0,
      receivedAt: new Date(at),
    });
  }

  return seeded;
}

/** Replaces the demo Meter's Readings; it never touches a Meter the SDR has heard from. */
async function main(): Promise<void> {
  await prisma.meter.upsert({ where: { id: METER_ID }, create: { id: METER_ID }, update: {} });
  await prisma.reading.deleteMany({ where: { meterId: METER_ID } });
  await prisma.meterEvent.deleteMany({ where: { meterId: METER_ID } });

  const seeded = readings();
  await prisma.reading.createMany({
    data: seeded.map((reading) => ({
      meterId: METER_ID,
      consumption: reading.consumption.toFixed(1),
      activeLeak: reading.activeLeak,
      leakHistory: 2,
      backflow: 0,
      noUse: 0,
      receivedAt: reading.receivedAt,
    })),
  });

  // The chart tints from Meter Events, which outlive the Readings the flags were read from.
  await prisma.meterEvent.createMany({
    data: [
      {
        meterId: METER_ID,
        flag: "activeLeak",
        from: 0,
        to: 1,
        occurredAt: new Date(ago(LEAK_FROM_DAYS)),
      },
      {
        meterId: METER_ID,
        flag: "activeLeak",
        from: 1,
        to: 0,
        occurredAt: new Date(ago(LEAK_TO_DAYS)),
      },
    ],
  });

  // Reseeding keeps the code already handed out, so a claimed device stays claimed.
  const existing = await prisma.claimCode.findFirst({
    where: { meterId: METER_ID, rotatedAt: null },
    select: { code: true },
  });
  const code = existing?.code ?? generateClaimCode();
  if (!existing) await prisma.claimCode.create({ data: { code, meterId: METER_ID } });

  console.log(
    `Seeded meter ${METER_ID} with ${seeded.length} readings over ${SEEDED_DAYS} days, a gap and a leak.`,
  );
  console.log(`Claim code: ${formatClaimCode(code)}`);
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

import { createPrismaClient } from "@meter-reader/db";
import { formatClaimCode, generateClaimCode } from "../src/lib/server/claim-code.js";

const METER_ID = 1_234_567_890n;
const READINGS = 48;
const INTERVAL_MS = 15 * 60 * 1000;

const prisma = createPrismaClient();

const USAGE_PATTERN = [0, 0, 0.4, 12.7, 3.1, 0, 0, 1.8, 24.5, 0, 0.6, 0];

/** Half a day of quarter-hourly Readings, ending now, so the meter page has something to show. */
function readings(): { consumption: string; receivedAt: Date }[] {
  const end = Date.now();
  let consumption = 481_320.5;

  return Array.from({ length: READINGS }, (_, index) => {
    consumption += USAGE_PATTERN[index % USAGE_PATTERN.length];
    return {
      consumption: consumption.toFixed(1),
      receivedAt: new Date(end - (READINGS - 1 - index) * INTERVAL_MS),
    };
  });
}

/** Replaces the demo Meter's Readings; it never touches a Meter the SDR has heard from. */
async function main(): Promise<void> {
  await prisma.meter.upsert({ where: { id: METER_ID }, create: { id: METER_ID }, update: {} });
  await prisma.reading.deleteMany({ where: { meterId: METER_ID } });
  await prisma.reading.createMany({
    data: readings().map((reading) => ({
      meterId: METER_ID,
      consumption: reading.consumption,
      activeLeak: 0,
      leakHistory: 0,
      backflow: 0,
      noUse: 0,
      receivedAt: reading.receivedAt,
    })),
  });

  // Reseeding keeps the code already handed out, so a claimed device stays claimed.
  const existing = await prisma.claimCode.findFirst({
    where: { meterId: METER_ID, rotatedAt: null },
    select: { code: true },
  });
  const code = existing?.code ?? generateClaimCode();
  if (!existing) await prisma.claimCode.create({ data: { code, meterId: METER_ID } });

  console.log(`Seeded meter ${METER_ID} with ${READINGS} readings.`);
  console.log(`Claim code: ${formatClaimCode(code)}`);
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

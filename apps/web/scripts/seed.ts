import { createPrismaClient } from "@meter-reader/db";
import { formatClaimCode, generateClaimCode } from "../src/lib/server/claim-code.js";

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

/** Levels wander around what a meter a few houses away reads, so the Admin list has one to sort by. */
const RSSI_DBM = -7.5;
const SNR_DB = 18;

const ZONE = "America/Chicago";
const STEP_MS = 15 * MINUTE_MS;

interface Stretch {
  fromDays: number;
  /** Null while the stretch is still running, which is how a Meter reads as leaking right now. */
  toDays: number | null;
}

interface Leak extends Stretch {
  /** 1 intermittent, 2 continuous, as the Meter reports Active Leak. */
  level: number;
  gallonsPerHour: number;
}

/** One Meter to seed, and the household, radio path and faults that make it read unlike the rest. */
interface MeterSeed {
  id: bigint;
  address?: string;
  disabled?: boolean;
  /** Multiplies the household day, from a one-bed apartment at 0.4 to a lawn at 2.5. */
  scale: number;
  /** Hours the household day is shifted by, so no two Meters peak together. */
  shift: number;
  /** Gallons on the dial when the seeded history opens. */
  startConsumption: number;
  /** How far back Readings go, 0 for a Meter the SDR has never once heard. */
  historyDays?: number;
  /** Share of transmissions the SDR hears at all, which is how far off the Meter is. */
  heard?: number;
  /** How long the Meter has been Stale, so the Admin list has one of each health to show. */
  silentForDays?: number;
  /** A stretch the receiver was down for, heard from neither this Meter nor its neighbours. */
  gap?: Stretch;
  leak?: Leak;
  /** The bucket the Meter reports days-with-a-leak in, 0 for a Meter that has never seen one. */
  leakHistory?: number;
  backflowSinceDays?: number;
  noUseSinceDays?: number;
  /** Null where rtl_433 is run without `-M level`, which leaves the Reading no Signal at all. */
  signal?: { rssi: number; snr: number } | null;
  /** What the devices holding a Grant called themselves, so the Admin can tell them apart. */
  devices?: string[];
}

/** The Meter the Claim Code is printed for, whose day, gap and leak the app is developed against. */
const DEMO_ID = 1_234_567_890n;

const METERS: MeterSeed[] = [
  {
    id: DEMO_ID,
    address: "100 Ash Ct",
    scale: 1,
    shift: 0,
    startConsumption: 481_320.5,
    gap: { fromDays: 2.95, toDays: 1.9 },
    leak: { fromDays: 4.4, toDays: 3.2, level: 1, gallonsPerHour: 9 },
    leakHistory: 2,
    signal: { rssi: RSSI_DBM, snr: SNR_DB },
    devices: ["Pixel 9", "iPad"],
  },
  {
    id: 1_580_213_447n,
    address: "104 Ash Ct",
    scale: 1.7,
    shift: 1,
    startConsumption: 812_004.2,
    signal: { rssi: -9.1, snr: 16.4 },
    devices: ["iPhone 16"],
  },
  {
    id: 1_602_884_112n,
    address: "108 Ash Ct",
    scale: 0.42,
    shift: 4,
    startConsumption: 96_711.8,
    signal: { rssi: -6.2, snr: 19.3 },
  },
  {
    id: 1_611_009_876n,
    address: "112 Ash Ct",
    scale: 1.1,
    shift: 2,
    startConsumption: 1_204_558.9,
    leak: { fromDays: 2.1, toDays: null, level: 2, gallonsPerHour: 24 },
    leakHistory: 2,
    signal: { rssi: -8.8, snr: 17.1 },
    devices: ["Galaxy S25"],
  },
  {
    id: 1_624_557_301n,
    address: "116 Ash Ct",
    scale: 0.95,
    shift: 6,
    startConsumption: 655_190.3,
    leak: { fromDays: 61, toDays: 40, level: 1, gallonsPerHour: 6 },
    leakHistory: 3,
    signal: { rssi: -11.4, snr: 14.8 },
  },
  {
    id: 1_633_890_045n,
    address: "201 Birch Ln",
    scale: 1.25,
    shift: 3,
    startConsumption: 388_042.7,
    silentForDays: 1.4,
    signal: { rssi: -13.7, snr: 12.2 },
    devices: ["MacBook Air"],
  },
  {
    id: 1_645_120_778n,
    address: "205 Birch Ln",
    scale: 0.8,
    shift: 9,
    startConsumption: 214_905.1,
    silentForDays: 6.2,
    signal: { rssi: -15.9, snr: 9.6 },
  },
  {
    id: 1_650_338_902n,
    scale: 1.05,
    shift: 11,
    startConsumption: 74_663.4,
    heard: 0.34,
    signal: { rssi: -19.2, snr: 5.7 },
  },
  {
    id: 1_667_442_215n,
    address: "213 Birch Ln",
    scale: 1.35,
    shift: 5,
    startConsumption: 902_337.6,
    signal: null,
  },
  {
    id: 1_679_003_558n,
    address: "217 Birch Ln",
    disabled: true,
    scale: 0,
    shift: 0,
    startConsumption: 1_877_412.0,
    noUseSinceDays: 34,
    signal: { rssi: -10.6, snr: 15.5 },
  },
  {
    id: 1_684_771_390n,
    address: "301 Cedar Way",
    scale: 1.15,
    shift: 8,
    startConsumption: 543_889.4,
    backflowSinceDays: 3.4,
    signal: { rssi: -7.9, snr: 18.6 },
  },
  {
    id: 1_692_845_617n,
    address: "305 Cedar Way",
    scale: 2.45,
    shift: 20,
    startConsumption: 2_318_770.5,
    leakHistory: 6,
    leak: { fromDays: 220, toDays: 150, level: 2, gallonsPerHour: 14 },
    signal: { rssi: -12.1, snr: 13.9 },
    devices: ["Pixel Tablet", "Surface", "iPhone 14"],
  },
  {
    id: 1_701_226_884n,
    address: "309 Cedar Way",
    scale: 0.7,
    shift: 7,
    startConsumption: 1_284.0,
    historyDays: 9,
    signal: { rssi: -8.3, snr: 17.8 },
  },
  {
    id: 1_714_559_073n,
    scale: 1,
    shift: 0,
    startConsumption: 0,
    historyDays: 0,
  },
  {
    id: 1_722_901_446n,
    address: "313 Cedar Way",
    scale: 1.45,
    shift: 10,
    startConsumption: 731_556.2,
    gap: { fromDays: 12.8, toDays: 11.4 },
    signal: { rssi: -14.2, snr: 11.3 },
  },
  {
    id: 1_735_664_209n,
    address: "401 Dogwood Dr",
    scale: 0.55,
    shift: 13,
    startConsumption: 158_224.9,
    heard: 0.72,
    signal: { rssi: -16.8, snr: 8.4 },
  },
  {
    id: 1_748_037_512n,
    address: "405 Dogwood Dr",
    scale: 1.9,
    shift: 15,
    startConsumption: 1_566_003.8,
    leak: { fromDays: 9.5, toDays: 7.8, level: 1, gallonsPerHour: 11 },
    leakHistory: 1,
    signal: { rssi: -9.7, snr: 16.9 },
    devices: ["iPhone SE"],
  },
  {
    id: 1_756_218_930n,
    address: "409 Dogwood Dr",
    scale: 0.88,
    shift: 18,
    startConsumption: 407_115.6,
    signal: { rssi: -11.9, snr: 14.1 },
  },
  {
    id: 1_763_490_155n,
    address: "413 Dogwood Dr",
    scale: 1.6,
    shift: 21,
    startConsumption: 988_602.1,
    silentForDays: 0.6,
    signal: { rssi: -6.8, snr: 19.9 },
    devices: ["Galaxy Tab"],
  },
  {
    id: 1_771_055_628n,
    address: "417 Dogwood Dr",
    scale: 0.65,
    shift: 16,
    startConsumption: 62_988.3,
    heard: 0.91,
    leakHistory: 4,
    leak: { fromDays: 95, toDays: 70, level: 1, gallonsPerHour: 4 },
    signal: { rssi: -17.5, snr: 7.2 },
  },
  {
    id: 1_788_113_074n,
    address: "421 Dogwood Dr",
    disabled: true,
    scale: 0.3,
    shift: 12,
    startConsumption: 1_012_447.7,
    silentForDays: 18,
    signal: { rssi: -13.1, snr: 12.8 },
  },
];

interface SeedReading {
  consumption: number;
  activeLeak: number;
  leakHistory: number;
  backflow: number;
  noUse: number;
  rssi: number | null;
  snr: number | null;
  receivedAt: Date;
}

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
const within = (stretch: Stretch, at: number) =>
  at >= ago(stretch.fromDays) && (stretch.toDays === null || at < ago(stretch.toDays));

/** A repeatable 0-1 from a Meter and an instant, so reseeding twice writes the same Readings. */
function jitter(id: bigint, at: number): number {
  let hash = Number(id % 2_147_483_647n) ^ Math.floor(at / STEP_MS);
  hash = Math.imul(hash ^ (hash >>> 16), 2_246_822_507);
  hash = Math.imul(hash ^ (hash >>> 13), 3_266_489_909);
  return ((hash ^ (hash >>> 16)) >>> 0) / 4_294_967_296;
}

/** Gallons used in the hour holding an instant, varied by weekday so no two weeks look alike. */
function gallonsPerHour(meter: MeterSeed, at: number): number {
  const weekday = new Date(`${chicagoDate.format(at)}T00:00:00Z`).getUTCDay();
  const shape = HOURLY_GALLONS[(Number(chicagoHour.format(at)) + meter.shift) % 24];
  const week = weekday === 0 || weekday === 6 ? 1.35 : 0.9 + (weekday % 3) * 0.12;

  return shape * meter.scale * week * (0.85 + jitter(meter.id, at) * 0.3);
}

/**
 * The Readings the nightly prune would have left of the ones the SDR heard: all of them for a week,
 * then the last of each hour, then the last of each Chicago day. Keeping the *last* is what makes
 * a pruned period's Usage exact (ADR-0003), so sparing any other Reading of the bucket would show
 * Partial periods the real thing never has.
 */
function pruned(heard: SeedReading[]): SeedReading[] {
  return heard.filter((reading, index) => {
    const at = reading.receivedAt.getTime();
    if (at >= ago(RAW_DAYS)) return true;

    const next = heard[index + 1];
    if (!next) return true;

    const nextAt = next.receivedAt.getTime();
    if (at >= ago(HOURLY_DAYS)) return Math.floor(at / HOUR_MS) !== Math.floor(nextAt / HOUR_MS);
    return chicagoDate.format(at) !== chicagoDate.format(nextAt);
  });
}

/**
 * Readings back to the Meter's history: water is used quarter-hourly throughout, but only what the
 * SDR heard is kept, and of that only what a prune would have spared. Consumption only ever climbs,
 * across a gap and a leak alike, which is what leaves a Partial period behind.
 */
function readings(meter: MeterSeed): SeedReading[] {
  const history = meter.historyDays ?? SEEDED_DAYS;
  if (history === 0) return [];

  const heard: SeedReading[] = [];
  let consumption = meter.startConsumption;

  // Aligned to the hour, so the Reading a prune would keep is the one at a quarter to.
  const start = Math.floor(ago(history) / STEP_MS) * STEP_MS;
  const last = meter.silentForDays === undefined ? now : ago(meter.silentForDays);
  const perStep = STEP_MS / HOUR_MS;

  for (let at = start; at <= last; at += STEP_MS) {
    const leaking = meter.leak && within(meter.leak, at) ? meter.leak : null;
    consumption += (gallonsPerHour(meter, at) + (leaking?.gallonsPerHour ?? 0)) * perStep;

    if (meter.gap && within(meter.gap, at)) continue;
    if (meter.heard !== undefined && jitter(meter.id ^ 1n, at) >= meter.heard) continue;

    const wander = Math.sin(at / (3 * HOUR_MS));
    const signal = meter.signal ?? { rssi: RSSI_DBM, snr: SNR_DB };

    heard.push({
      consumption: Math.round(consumption * 10) / 10,
      activeLeak: leaking?.level ?? 0,
      leakHistory: meter.leakHistory ?? 0,
      backflow: meter.backflowSinceDays !== undefined && at >= ago(meter.backflowSinceDays) ? 1 : 0,
      noUse: meter.noUseSinceDays !== undefined && at >= ago(meter.noUseSinceDays) ? 1 : 0,
      rssi: meter.signal === null ? null : Math.round((signal.rssi + wander * 2) * 10) / 10,
      snr: meter.signal === null ? null : Math.round((signal.snr + wander * 3) * 10) / 10,
      receivedAt: new Date(at),
    });
  }

  return pruned(heard);
}

/** The chart tints from Meter Events, which outlive the Readings the flags were read from. */
function events(meter: MeterSeed) {
  const rows: {
    flag: "activeLeak" | "backflow" | "noUse";
    from: number;
    to: number;
    at: number;
  }[] = [];

  if (meter.leak) {
    rows.push({ flag: "activeLeak", from: 0, to: meter.leak.level, at: ago(meter.leak.fromDays) });
    if (meter.leak.toDays !== null) {
      rows.push({ flag: "activeLeak", from: meter.leak.level, to: 0, at: ago(meter.leak.toDays) });
    }
  }
  if (meter.backflowSinceDays !== undefined) {
    rows.push({ flag: "backflow", from: 0, to: 1, at: ago(meter.backflowSinceDays) });
  }
  if (meter.noUseSinceDays !== undefined) {
    rows.push({ flag: "noUse", from: 0, to: 1, at: ago(meter.noUseSinceDays) });
  }

  return rows.map(({ flag, from, to, at }) => ({
    meterId: meter.id,
    flag,
    from,
    to,
    occurredAt: new Date(at),
  }));
}

/** Reseeding keeps the code already handed out, so a claimed device stays claimed. */
async function claimCode(meterId: bigint): Promise<string> {
  const existing = await prisma.claimCode.findFirst({
    where: { meterId, rotatedAt: null },
    select: { code: true },
  });
  if (existing) return existing.code;

  const code = generateClaimCode();
  await prisma.claimCode.create({ data: { code, meterId } });
  return code;
}

async function seed(meter: MeterSeed): Promise<number> {
  await prisma.meter.upsert({
    where: { id: meter.id },
    create: {
      id: meter.id,
      address: meter.address ?? null,
      disabledAt: meter.disabled ? new Date(ago(30)) : null,
    },
    update: {
      address: meter.address ?? null,
      disabledAt: meter.disabled ? new Date(ago(30)) : null,
    },
  });
  await prisma.reading.deleteMany({ where: { meterId: meter.id } });
  await prisma.meterEvent.deleteMany({ where: { meterId: meter.id } });

  const seeded = readings(meter);
  await prisma.reading.createMany({
    data: seeded.map((reading) => ({
      meterId: meter.id,
      consumption: reading.consumption.toFixed(1),
      activeLeak: reading.activeLeak,
      leakHistory: reading.leakHistory,
      backflow: reading.backflow,
      noUse: reading.noUse,
      rssi: reading.rssi,
      snr: reading.snr,
      receivedAt: reading.receivedAt,
    })),
  });
  await prisma.meterEvent.createMany({ data: events(meter) });

  const code = await claimCode(meter.id);

  // Grants stand for devices that have already claimed, so only a Meter with none is given them.
  const claimed = await prisma.grant.count({ where: { meterId: meter.id } });
  if (!claimed && meter.devices) {
    await prisma.grant.createMany({
      data: meter.devices.map((device) => ({ meterId: meter.id, claimCode: code, device })),
    });
  }

  return seeded.length;
}

/** Replaces the seeded Meters' Readings; it never touches a Meter the SDR has heard from. */
async function main(): Promise<void> {
  let total = 0;
  for (const meter of METERS) {
    const count = await seed(meter);
    total += count;
    console.log(`  ${String(meter.id).padStart(10)} ${String(count).padStart(5)} readings`);
  }

  console.log(
    `Seeded ${METERS.length} meters with ${total} readings over ${SEEDED_DAYS} days, gaps and leaks.`,
  );
  console.log(`Claim code for meter ${DEMO_ID}: ${formatClaimCode(await claimCode(DEMO_ID))}`);
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

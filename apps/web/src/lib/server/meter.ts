import type { PrismaClient } from "@meter-reader/db";

const MAX_METER_ID = 0xffff_ffffn;

/** The Meter id as it appears in a URL, or null if no Meter could ever have it. */
export function parseMeterId(value: string): bigint | null {
  if (!/^(0|[1-9]\d*)$/.test(value)) return null;

  const id = BigInt(value);
  return id > MAX_METER_ID ? null : id;
}

export interface MeterReading {
  /** The Meter's lifetime cumulative total in gallons. */
  consumption: number;
  receivedAt: Date;
}

/**
 * The `leaknow` flag: water used in at least 50 of the last 96 quarter-hours, or in every one.
 * A flag outside those the meter documents still counts as a leak, of a kind we cannot name.
 */
export type ActiveLeakLevel = "none" | "intermittent" | "continuous" | "unknown";

export function activeLeakLevel(flag: number): ActiveLeakLevel {
  if (flag <= 0) return "none";
  if (flag === 1) return "intermittent";
  return flag === 2 ? "continuous" : "unknown";
}

const LEAK_HISTORY_BUCKETS = [
  "None",
  "1–2 days",
  "3–7 days",
  "8–14 days",
  "15–21 days",
  "22–34 days",
  "35+ days",
];

/** The bucket the `leak` field names, or null for one no meter can report, which we would rather not guess at. */
export function leakHistoryLabel(bucket: number): string | null {
  return LEAK_HISTORY_BUCKETS[bucket] ?? null;
}

export interface LatestReading extends MeterReading {
  activeLeak: ActiveLeakLevel;
  /** The Leak History bucket's label, or null if the meter reported a bucket it cannot have. */
  leakHistory: string | null;
}

/** The Meter's latest Reading, or null while it has never been heard from. */
export async function latestReading(
  prisma: PrismaClient,
  meterId: bigint,
): Promise<LatestReading | null> {
  const reading = await prisma.reading.findFirst({
    where: { meterId },
    orderBy: [{ receivedAt: "desc" }, { id: "desc" }],
    select: { consumption: true, receivedAt: true, activeLeak: true, leakHistory: true },
  });
  if (!reading) return null;

  return {
    consumption: reading.consumption.toNumber(),
    receivedAt: reading.receivedAt,
    activeLeak: activeLeakLevel(reading.activeLeak),
    leakHistory: leakHistoryLabel(reading.leakHistory),
  };
}

export type MeterHealth = "fresh" | "stale" | "broken";

const DAY_MS = 24 * 60 * 60 * 1000;
const UNHEARD_BEFORE_STALE_MS = DAY_MS;
const UNHEARD_BEFORE_BROKEN_MS = 3 * DAY_MS;

/** Stale once a day has passed unheard from, broken once three have (CONTEXT.md: Stale). */
export function meterHealth(lastHeardAt: Date, now: Date): MeterHealth {
  const unheardForMs = now.getTime() - lastHeardAt.getTime();
  if (unheardForMs >= UNHEARD_BEFORE_BROKEN_MS) return "broken";
  return unheardForMs >= UNHEARD_BEFORE_STALE_MS ? "stale" : "fresh";
}

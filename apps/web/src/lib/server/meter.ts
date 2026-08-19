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

/** The Meter's latest Reading, or null while it has never been heard from. */
export async function latestReading(
  prisma: PrismaClient,
  meterId: bigint,
): Promise<MeterReading | null> {
  const reading = await prisma.reading.findFirst({
    where: { meterId },
    orderBy: [{ receivedAt: "desc" }, { id: "desc" }],
    select: { consumption: true, receivedAt: true },
  });
  if (!reading) return null;

  return { consumption: reading.consumption.toNumber(), receivedAt: reading.receivedAt };
}

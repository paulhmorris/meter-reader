import type { MeterEventFlag, PrismaClient } from "@meter-reader/db";
import { activeLeakLevel } from "./meter.js";

/** A recorded transition of one of the Meter's flags, in the words a neighbour would use for it. */
export interface MeterEvent {
  id: string;
  description: string;
  occurredAt: Date;
}

const LEAK_KINDS = { intermittent: "on and off", continuous: "running non-stop" };

function describeActiveLeak(from: number, to: number): string {
  const level = activeLeakLevel(to);
  if (level === "none") return "Leak stopped";

  if (activeLeakLevel(from) === "none") {
    return level === "unknown" ? "Leak started" : `Leak started, ${LEAK_KINDS[level]}`;
  }
  return level === "unknown" ? "Leak changed" : `Leak changed to ${LEAK_KINDS[level]}`;
}

export function describeEvent(event: { flag: MeterEventFlag; from: number; to: number }): string {
  switch (event.flag) {
    case "activeLeak":
      return describeActiveLeak(event.from, event.to);
    case "backflow":
      return event.to === 0
        ? "Water stopped flowing backwards"
        : "Water flowed backwards through the meter";
    case "noUse":
      return event.to === 0 ? "Water use resumed" : "No water used at all";
  }
}

/** The Meter's recorded transitions, newest first, with whether older ones are being held back. */
export async function recentEvents(
  prisma: PrismaClient,
  meterId: bigint,
  limit: number,
): Promise<{ events: MeterEvent[]; older: boolean }> {
  const events = await prisma.meterEvent.findMany({
    where: { meterId },
    orderBy: [{ occurredAt: "desc" }, { id: "desc" }],
    take: limit + 1,
    select: { id: true, flag: true, from: true, to: true, occurredAt: true },
  });

  return {
    events: events.slice(0, limit).map((event) => ({
      id: String(event.id),
      description: describeEvent(event),
      occurredAt: event.occurredAt,
    })),
    older: events.length > limit,
  };
}

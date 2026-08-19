import type { PrismaClient } from "@meter-reader/db";
import { activeLeakLevel } from "./meter.js";

/** A stretch of time the Meter spent reporting an Active Leak. Open-ended while the leak still runs. */
export interface LeakInterval {
  start: Date;
  end: Date | null;
}

export interface LeakStore {
  /** Active Leak transitions up to `to`, oldest first, preceded by the last one before `from`. */
  activeLeakTransitions(
    meterId: bigint,
    range: { from: Date; to: Date },
  ): Promise<{ to: number; occurredAt: Date }[]>;
}

export function prismaLeakStore(prisma: PrismaClient): LeakStore {
  return {
    async activeLeakTransitions(meterId, { from, to }) {
      const [before, within] = await Promise.all([
        prisma.meterEvent.findMany({
          where: { meterId, flag: "activeLeak", occurredAt: { lt: from } },
          orderBy: [{ occurredAt: "desc" }, { id: "desc" }],
          take: 1,
          select: { to: true, occurredAt: true },
        }),
        prisma.meterEvent.findMany({
          where: { meterId, flag: "activeLeak", occurredAt: { gte: from, lte: to } },
          orderBy: [{ occurredAt: "asc" }, { id: "asc" }],
          select: { to: true, occurredAt: true },
        }),
      ]);

      return [...before, ...within];
    },
  };
}

/**
 * The stretches the Meter was leaking during the window, from its recorded transitions. A leak
 * open when the window starts is reported from the window's start, not from when it began.
 */
export function leakIntervals(
  transitions: { to: number; occurredAt: Date }[],
  { from, to }: { from: Date; to: Date },
): LeakInterval[] {
  const intervals: LeakInterval[] = [];
  let open: Date | null = null;

  for (const transition of transitions) {
    const leaking = activeLeakLevel(transition.to) !== "none";
    const at = transition.occurredAt < from ? from : transition.occurredAt;

    if (leaking && open === null) open = at;
    else if (!leaking && open !== null) {
      if (at > open) intervals.push({ start: open, end: at });
      open = null;
    }
  }

  if (open !== null && open < to) intervals.push({ start: open, end: null });
  return intervals;
}

/** Whether a period overlaps any of the leaks, which is what tints its bar in the chart. */
export function overlapsLeak(period: { start: Date; end: Date }, intervals: LeakInterval[]) {
  return intervals.some(
    (interval) =>
      interval.start < period.end && (interval.end === null || interval.end > period.start),
  );
}

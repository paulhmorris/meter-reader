import type { MeterReading } from "./meter.js";
import { periods, type Granularity } from "./periods.js";

export interface Boundary {
  /** The last Reading strictly before the instant. */
  before: MeterReading | null;
  /** The first Reading at or after the instant. */
  from: MeterReading | null;
}

/** A Reading as the running line plots it: its Consumption and whether it reported a leak. */
export interface TracedReading extends MeterReading {
  /** Whether the Meter was reporting an Active Leak when the Reading arrived. */
  leaking: boolean;
}

export interface Trace {
  /** The last Reading before the stretch opens, from which the stretch's Usage is measured. */
  opening: TracedReading | null;
  /** Every Reading stored in the stretch, oldest first. */
  readings: TracedReading[];
}

export interface UsageStore {
  /** The Readings either side of each instant, in the order the instants were given. */
  boundaryReadings(meterId: bigint, instants: Date[]): Promise<Boundary[]>;
  /** Every Reading in the stretch, with the one before it opens. */
  readingsIn(meterId: bigint, stretch: { from: Date; to: Date }): Promise<Trace>;
}

export interface UsagePeriod {
  start: Date;
  end: Date;
  /** Gallons consumed during the period. */
  gallons: number;
  /** Understated or overstated, because a Reading near a boundary is missing. */
  partial: boolean;
  /** Whether any Reading landed inside the period, rather than it being silence read as zero. */
  heard: boolean;
}

/**
 * How stale a boundary Reading may be before the Consumption at that boundary counts as unknown:
 * a Heartbeat plus slack for hours, since a Heartbeat is forced once 15 minutes have *elapsed* and
 * so lands a transmission or two late; an hour for days, since pruning thins Readings to one an
 * hour past a week old and a day of Usage survives that intact (ADR-0003).
 *
 * Weeks and months take the daily tolerance, because their boundaries are Chicago midnights too
 * and every tier pruning leaves behind keeps the last Reading of a bucket: one an hour to 60 days,
 * one a Chicago day to a year, both of which land a Heartbeat or so before a midnight. Past a year
 * only one Reading a Monday week survives, which a week boundary is but the first of a month is
 * not — so months that old read Partial, which is what they are.
 */
const STALE_AFTER_MS: Record<Granularity, number> = {
  hour: 20 * 60 * 1000,
  day: 60 * 60 * 1000,
  week: 60 * 60 * 1000,
  month: 60 * 60 * 1000,
};

/**
 * Whether the Consumption at an instant is known: either a Reading landed close enough before it,
 * or the Readings either side of the silence agree that no water was used across it, which leaves
 * nothing for the gap to have misattributed however long it ran.
 */
function trusted(
  boundary: Date,
  { before, from }: Boundary,
  { to, staleAfterMs }: { to: Date; staleAfterMs: number },
): boolean {
  if (before === null) return false;

  // The period holding to is still in progress, so its end is judged from to, not from the future.
  const instant = boundary > to ? to : boundary;
  if (instant.getTime() - before.receivedAt.getTime() <= staleAfterMs) return true;

  return from !== null && from.consumption === before.consumption;
}

/**
 * Usage per period for one Meter, each period's Usage being the last Reading in it minus the last
 * Reading before it starts. Nothing is interpolated: a period missing a boundary Reading reads as
 * the Usage the stored Readings can account for, marked Partial (ADR-0002).
 */
export async function usageByPeriod(
  { store }: { store: UsageStore },
  {
    meterId,
    granularity,
    from,
    to,
  }: { meterId: bigint; granularity: Granularity; from: Date; to: Date },
): Promise<UsagePeriod[]> {
  const covered = periods(granularity, { from, to });
  if (covered.length === 0) return [];

  const limits = { to, staleAfterMs: STALE_AFTER_MS[granularity] };
  const boundaries = [...covered.map((period) => period.start), covered[covered.length - 1].end];
  const readings = await store.boundaryReadings(meterId, boundaries);

  return covered.map((period, index) => {
    const before = readings[index].before;
    // Nothing precedes the first period the Meter was ever heard in, so its own first Reading
    // opens it: what the stored Readings account for, understated and Partial (ADR-0002).
    const opening = before ?? readings[index].from;
    const closing = readings[index + 1].before;
    const gallons = opening && closing ? closing.consumption - opening.consumption : 0;

    return {
      ...period,
      gallons: Math.round(gallons * 10) / 10,
      heard: closing !== null && closing.receivedAt >= period.start,
      partial:
        !trusted(period.start, readings[index], limits) ||
        !trusted(period.end, readings[index + 1], limits),
    };
  });
}

/** One Reading on the running line: where the total stood the moment it arrived. */
export interface UsagePoint {
  at: Date;
  /** Gallons used since the stretch opened. */
  gallons: number;
  leaking: boolean;
  /** Whether the Meter went unheard between the point before this one and this one. */
  afterSilence: boolean;
}

/** Whether the Meter went unheard across a stretch, a Heartbeat being forced every 15 minutes. */
function unheard(before: Date, after: Date): boolean {
  return after.getTime() - before.getTime() > STALE_AFTER_MS.hour;
}

/**
 * The running total of Usage across a stretch, a point per Reading at the moment it arrived,
 * rebased so the stretch opens at nothing used. Nothing is interpolated: a silence longer than a
 * Heartbeat is marked, so the line can break rather than carry the total across it (ADR-0002).
 */
export async function runningUsage(
  { store }: { store: UsageStore },
  { meterId, from, to }: { meterId: bigint; from: Date; to: Date },
): Promise<UsagePoint[]> {
  const { opening, readings } = await store.readingsIn(meterId, { from, to });
  if (readings.length === 0) return [];

  // Nothing precedes the first Reading the Meter was ever heard in, so it opens the stretch itself.
  const baseline = opening ?? readings[0];

  // A Meter heard just before the stretch pins the line to the left edge at nothing used, rather
  // than leaving it to start wherever the first Reading of the stretch happened to land.
  const traced =
    opening !== null && !unheard(opening.receivedAt, from)
      ? [{ ...opening, receivedAt: from }, ...readings]
      : readings;

  return traced.map((reading, index) => ({
    at: reading.receivedAt,
    gallons: Math.round((reading.consumption - baseline.consumption) * 10) / 10,
    leaking: reading.leaking,
    afterSilence: index > 0 && unheard(traced[index - 1].receivedAt, reading.receivedAt),
  }));
}

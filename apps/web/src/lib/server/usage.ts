import type { MeterReading } from "./meter.js";
import { periods, type Granularity } from "./periods.js";

export interface UsageStore {
  /** The last Reading strictly before each instant, in the order the instants were given. */
  lastReadingBefore(meterId: bigint, instants: Date[]): Promise<(MeterReading | null)[]>;
}

export interface UsagePeriod {
  start: Date;
  end: Date;
  /** Gallons consumed during the period. */
  gallons: number;
  /** Understated or overstated, because a Reading near a boundary is missing. */
  partial: boolean;
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

function trusted(
  boundary: Date,
  reading: MeterReading | null,
  { to, staleAfterMs }: { to: Date; staleAfterMs: number },
): boolean {
  // The period holding to is still in progress, so its end is judged from to, not from the future.
  const instant = boundary > to ? to : boundary;
  return reading !== null && instant.getTime() - reading.receivedAt.getTime() <= staleAfterMs;
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
  const readings = await store.lastReadingBefore(meterId, boundaries);

  return covered.map((period, index) => {
    const opening = readings[index];
    const closing = readings[index + 1];
    const gallons = opening && closing ? closing.consumption - opening.consumption : 0;

    return {
      ...period,
      gallons: Math.round(gallons * 10) / 10,
      partial: !trusted(period.start, opening, limits) || !trusted(period.end, closing, limits),
    };
  });
}

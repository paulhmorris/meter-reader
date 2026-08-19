import { bucketKey, type Tier, tierWindows, type TierWindow } from "./tiers.js";

export interface PrunableReading {
  id: bigint;
  receivedAt: Date;
}

/** Where a scan of one window left off, ordered as the scan is: by receivedAt, then id. */
export interface ReadingCursor {
  receivedAt: Date;
  id: bigint;
}

export interface PruneStore {
  meterIds(): Promise<bigint[]>;
  /** The Meter's Readings in the window after the cursor, oldest first, at most `limit` of them. */
  readingsInWindow(
    meterId: bigint,
    window: { start: Date; end: Date },
    after: ReadingCursor | null,
    limit: number,
  ): Promise<PrunableReading[]>;
  deleteReadings(ids: bigint[]): Promise<number>;
}

export type PrunedCounts = Record<Tier, number>;

const BATCH_SIZE = 500;

/** Every Reading but the last of each bucket, the last being the one that preserves its Usage. */
export function superseded(readings: PrunableReading[], tier: Tier): bigint[] {
  const doomed: bigint[] = [];

  for (const [index, reading] of readings.entries()) {
    const next = readings[index + 1];
    if (next && bucketKey(tier, reading.receivedAt) === bucketKey(tier, next.receivedAt)) {
      doomed.push(reading.id);
    }
  }

  return doomed;
}

async function pruneWindow(
  store: PruneStore,
  meterId: bigint,
  { tier, ...window }: TierWindow,
  batchSize: number,
): Promise<number> {
  let deleted = 0;
  let cursor: ReadingCursor | null = null;
  // The batch before's last Reading, which the next batch may supersede.
  let carried: PrunableReading | undefined;

  for (;;) {
    const batch = await store.readingsInWindow(meterId, window, cursor, batchSize);
    if (batch.length === 0) return deleted;

    const doomed = superseded(carried ? [carried, ...batch] : batch, tier);
    if (doomed.length > 0) deleted += await store.deleteReadings(doomed);

    carried = batch[batch.length - 1];
    cursor = { receivedAt: carried.receivedAt, id: carried.id };
    if (batch.length < batchSize) return deleted;
  }
}

/**
 * Thins every Meter's Readings by age — raw for 7 days, then one an hour to 60 days, one a day to
 * a year, one a week beyond — keeping the last Reading of each bucket so that the Usage of any
 * period the UI shows for that age is unchanged (ADR-0003). Meter Events are never touched.
 *
 * Readings are scanned and deleted a batch at a time, so live ingest is never locked out for long.
 */
export async function pruneReadings(
  store: PruneStore,
  now: Date,
  { batchSize = BATCH_SIZE }: { batchSize?: number } = {},
): Promise<PrunedCounts> {
  const deleted: PrunedCounts = { hour: 0, day: 0, week: 0 };
  const meterIds = await store.meterIds();

  for (const window of tierWindows(now)) {
    for (const meterId of meterIds) {
      deleted[window.tier] += await pruneWindow(store, meterId, window, batchSize);
    }
  }

  return deleted;
}

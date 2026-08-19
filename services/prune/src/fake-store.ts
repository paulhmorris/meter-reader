import type { PrunableReading, PruneStore, ReadingCursor } from "./prune.js";

export interface FakeReading extends PrunableReading {
  meterId: bigint;
  consumption: number;
}

export interface FakeStore extends PruneStore {
  readings: FakeReading[];
  deleteCalls: number;
}

/** Stands in for Postgres, ordering and filtering Readings the way the real store's query does. */
export function fakeStore(readings: FakeReading[]): FakeStore {
  const store: FakeStore = {
    readings: [...readings],
    deleteCalls: 0,

    async meterIds() {
      return [...new Set(store.readings.map((reading) => reading.meterId))];
    },

    async readingsInWindow(meterId, window, after, limit) {
      return store.readings
        .filter(
          (reading) =>
            reading.meterId === meterId &&
            reading.receivedAt >= window.start &&
            reading.receivedAt < window.end &&
            (after === null || isAfter(reading, after)),
        )
        .sort(byReceivedAtThenId)
        .slice(0, limit)
        .map((reading) => ({ id: reading.id, receivedAt: reading.receivedAt }));
    },

    async deleteReadings(ids) {
      store.deleteCalls += 1;
      const doomed = new Set(ids);
      const before = store.readings.length;
      store.readings = store.readings.filter((reading) => !doomed.has(reading.id));
      return before - store.readings.length;
    },
  };

  return store;
}

function isAfter(reading: PrunableReading, cursor: ReadingCursor): boolean {
  if (reading.receivedAt.getTime() !== cursor.receivedAt.getTime()) {
    return reading.receivedAt > cursor.receivedAt;
  }
  return reading.id > cursor.id;
}

function byReceivedAtThenId(a: PrunableReading, b: PrunableReading): number {
  return a.receivedAt.getTime() - b.receivedAt.getTime() || Number(a.id - b.id);
}

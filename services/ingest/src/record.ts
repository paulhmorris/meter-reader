import type { R900Flags, R900Reading } from "./r900.js";

/** What the Meter's last stored Reading says, which every new transmission is judged against. */
export interface StoredReading {
  /** Gallons to one decimal place, in the same form parseR900 produces, so it compares as a string. */
  consumption: string;
  flags: R900Flags;
  receivedAt: Date;
}

export interface ReadingStore {
  /** The Meter's last stored Reading, or null if it has never been heard from. */
  lastReading(meterId: bigint): Promise<StoredReading | null>;
  save(reading: R900Reading, receivedAt: Date): Promise<void>;
}

export type RecordResult =
  | { status: "stored" }
  | { status: "heartbeat" }
  | { status: "suppressed" }
  | { status: "rejected"; reading: R900Reading; lastConsumption: string };

const HEARTBEAT_INTERVAL_MS = 15 * 60 * 1000;

function sameFlags(a: R900Flags, b: R900Flags): boolean {
  return (
    a.activeLeak === b.activeLeak &&
    a.leakHistory === b.leakHistory &&
    a.backflow === b.backflow &&
    a.noUse === b.noUse
  );
}

/**
 * Stores one transmission, unless it says nothing new — an identical one is dropped except as
 * the 15-minute Heartbeat, which is what tells a silent Meter apart from an unused one.
 *
 * A fallen Consumption means a wrapped counter, a swapped meter, or a corrupt packet, all of
 * which need a human (ADR-0002).
 */
export async function recordReading(
  store: ReadingStore,
  reading: R900Reading,
  receivedAt: Date,
): Promise<RecordResult> {
  const last = await store.lastReading(reading.meterId);
  if (last === null) {
    await store.save(reading, receivedAt);
    return { status: "stored" };
  }

  if (Number(reading.consumption) < Number(last.consumption)) {
    return { status: "rejected", reading, lastConsumption: last.consumption };
  }

  if (reading.consumption !== last.consumption || !sameFlags(reading.flags, last.flags)) {
    await store.save(reading, receivedAt);
    return { status: "stored" };
  }

  if (receivedAt.getTime() - last.receivedAt.getTime() < HEARTBEAT_INTERVAL_MS) {
    return { status: "suppressed" };
  }

  await store.save(reading, receivedAt);
  return { status: "heartbeat" };
}

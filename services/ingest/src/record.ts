import type { R900Reading } from "./r900.js";

export interface ReadingStore {
  /** The Meter's last stored Consumption in gallons, or null if it has never been heard from. */
  lastConsumption(meterId: bigint): Promise<string | null>;
  save(reading: R900Reading, receivedAt: Date): Promise<void>;
}

export type RecordResult =
  | { status: "stored" }
  | { status: "rejected"; reading: R900Reading; lastConsumption: string };

/**
 * Consumption only ever increases, so a lower one means a wrapped counter, a swapped
 * meter, or a corrupt packet — all of which need a human, and none of which we store (ADR-0002).
 */
export async function recordReading(
  store: ReadingStore,
  reading: R900Reading,
  receivedAt: Date,
): Promise<RecordResult> {
  const last = await store.lastConsumption(reading.meterId);
  if (last !== null && Number(reading.consumption) < Number(last)) {
    return { status: "rejected", reading, lastConsumption: last };
  }

  await store.save(reading, receivedAt);
  return { status: "stored" };
}

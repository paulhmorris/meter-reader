import { parseR900 } from "./r900.js";
import { recordReading, type ReadingStore, type RecordResult } from "./record.js";

export type PayloadResult = { status: "ignored" } | RecordResult;

/** Turns one MQTT payload into a stored Reading, ignoring anything that is not an R900 transmission. */
export async function handlePayload(
  store: ReadingStore,
  payload: Buffer,
  receivedAt: Date,
): Promise<PayloadResult> {
  const reading = parseR900(payload);
  if (!reading) return { status: "ignored" };

  return recordReading(store, reading, receivedAt);
}

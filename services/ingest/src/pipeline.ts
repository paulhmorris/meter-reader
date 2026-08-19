import { parseR900 } from "./r900.js";
import { recordReading, type ReadingStore, type RecordResult } from "./record.js";
import { warnAboutLeaks, type WarnDeps } from "./warn.js";

export interface PipelineDeps {
  store: ReadingStore;
  /** Null where no VAPID keys are configured, which leaves the app with no way to warn anyone. */
  warn: WarnDeps | null;
}

export type PayloadResult = { status: "ignored" } | RecordResult;

/**
 * Turns one MQTT payload into a stored Reading, ignoring anything that is not an R900
 * transmission, and warns subscribed devices about any leak the Reading opened.
 */
export async function handlePayload(
  { store, warn }: PipelineDeps,
  payload: Buffer,
  receivedAt: Date,
): Promise<PayloadResult> {
  const reading = parseR900(payload);
  if (!reading) return { status: "ignored" };

  const result = await recordReading(store, reading, receivedAt);
  if (result.status === "stored" && warn) {
    await warnAboutLeaks(warn, reading.meterId, result.events);
  }

  return result;
}

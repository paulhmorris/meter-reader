import type { MeterEventDraft } from "./record.js";

/** A browser's address for pushing to one device, with the keys the warning is encrypted to. */
export interface PushEndpoint {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
}

/** What a device is shown when its Meter starts reporting a leak. */
export interface LeakWarning {
  title: string;
  body: string;
  url: string;
}

export type PushResult = "sent" | "gone" | "failed";

export interface Pusher {
  /** "gone" only where the push service says this endpoint will never accept another push. */
  send(endpoint: PushEndpoint, warning: LeakWarning): Promise<PushResult>;
}

export interface PushEndpointStore {
  /** Every Push Endpoint held against a Grant this Meter still honours. */
  liveEndpoints(meterId: bigint): Promise<PushEndpoint[]>;
  forget(id: string): Promise<void>;
}

export interface WarnDeps {
  store: PushEndpointStore;
  pusher: Pusher;
}

/**
 * A leak opening is the only thing worth waking someone for: backflow and no-use are not
 * emergencies, a leak that changes kind is one they have already been told about, and a leak
 * clearing is good news that can wait for the page.
 */
export function opensActiveLeak(event: MeterEventDraft): boolean {
  return event.flag === "activeLeak" && event.from <= 0 && event.to > 0;
}

const CONTINUOUS = 2;

function leakWarning(meterId: bigint, event: MeterEventDraft): LeakWarning {
  const kind =
    event.to === CONTINUOUS
      ? "Water has run through it without a break for a day."
      : "Water has run through it for much of the day, in bursts.";

  return { title: `Meter ${meterId} is reporting a leak`, body: kind, url: `/meter/${meterId}` };
}

/**
 * Warns every device still entitled to hear about this Meter that a Meter Event opened an Active
 * Leak — one Reading moves the flag once, so no device is warned twice for the same leak. An
 * endpoint the push service has given up on is forgotten rather than retried forever; anything
 * else is left in place, the next leak being the retry.
 */
export async function warnAboutLeaks(
  { store, pusher }: WarnDeps,
  meterId: bigint,
  events: MeterEventDraft[],
): Promise<void> {
  const opened = events.find(opensActiveLeak);
  if (!opened) return;

  const warning = leakWarning(meterId, opened);

  for (const endpoint of await store.liveEndpoints(meterId)) {
    if ((await pusher.send(endpoint, warning)) === "gone") await store.forget(endpoint.id);
  }
}

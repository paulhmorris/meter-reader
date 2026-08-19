import * as Sentry from "@sentry/node";
import webpush, { WebPushError } from "web-push";
import type { Pusher } from "./warn.js";

export interface VapidDetails {
  /** Who the push service should contact about this app, as a mailto: or https: URL. */
  subject: string;
  publicKey: string;
  privateKey: string;
}

/** A leak warning is stale once the leak has had time to be seen on the page. */
const TTL_SECONDS = 6 * 60 * 60;

/** Both codes mean this device will never accept another push, however long we keep it. */
const ENDPOINT_GONE = [404, 410];

/** Whether the push service has given up on this endpoint, as opposed to merely failing us. */
export function endpointGone(error: unknown): boolean {
  return error instanceof WebPushError && ENDPOINT_GONE.includes(error.statusCode);
}

export function webPushPusher(vapid: VapidDetails): Pusher {
  return {
    async send({ endpoint, p256dh, auth }, warning) {
      try {
        await webpush.sendNotification(
          { endpoint, keys: { p256dh, auth } },
          JSON.stringify(warning),
          { vapidDetails: vapid, TTL: TTL_SECONDS },
        );
        return "sent";
      } catch (error) {
        if (endpointGone(error)) return "gone";

        // One unreachable push service must not cost the other devices their warning.
        console.error(`ingest: pushing a leak warning to ${endpoint} failed`, error);
        Sentry.captureException(error);
        return "failed";
      }
    },
  };
}

import * as Sentry from "@sentry/node";
import mqtt, { type MqttClient } from "mqtt";

export interface BrokerConfig {
  url: string;
  topic: string;
  username: string;
  password: string;
}

const INITIAL_RECONNECT_MS = 1_000;
const MAX_RECONNECT_MS = 60_000;
/** Reconnect attempts to tolerate before an outage is worth waking a human over. */
const ATTEMPTS_BEFORE_REPORTING = 5;

/**
 * Subscribes to the rtl_433 topic and hands every payload to `onPayload`, reconnecting
 * on its own with exponential backoff and reporting a sustained outage to Sentry once.
 */
export function subscribeToBroker(
  config: BrokerConfig,
  onPayload: (payload: Buffer) => void,
): MqttClient {
  const client = mqtt.connect(config.url, {
    username: config.username,
    password: config.password,
    // mqtt.js arms its own reconnect as a fixed interval, so backoff has to be driven here.
    reconnectPeriod: 0,
  });

  let attempts = 0;
  let outageReported = false;
  let retry: NodeJS.Timeout | undefined;
  let stopped = false;

  function scheduleReconnect(): void {
    if (stopped || retry) return;

    const delay = Math.min(INITIAL_RECONNECT_MS * 2 ** attempts, MAX_RECONNECT_MS);
    attempts += 1;
    if (attempts >= ATTEMPTS_BEFORE_REPORTING && !outageReported) {
      outageReported = true;
      Sentry.captureMessage("ingest: cannot reach the MQTT broker", {
        level: "error",
        extra: { url: config.url, attempts },
      });
    }

    console.warn(`ingest: MQTT broker unreachable, retrying in ${delay}ms`);
    retry = setTimeout(() => {
      retry = undefined;
      client.reconnect();
    }, delay);
  }

  client.on("connect", () => {
    attempts = 0;
    outageReported = false;
    client.subscribe(config.topic, (error) => {
      if (error) {
        Sentry.captureException(error);
        console.error(`ingest: cannot subscribe to ${config.topic}`, error);
        return;
      }
      console.log(`ingest: subscribed to ${config.topic}`);
    });
  });

  client.on("error", (error) => console.error("ingest: MQTT error", error));
  client.on("close", () => scheduleReconnect());
  client.on("end", () => {
    stopped = true;
    clearTimeout(retry);
  });

  client.on("message", (_topic, payload) => onPayload(payload));

  return client;
}

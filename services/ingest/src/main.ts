import "./instrument.js";

import * as Sentry from "@sentry/node";
import type { MqttClient } from "mqtt";
import { createPrismaClient, type PrismaClient } from "@meter-reader/db";
import { subscribeToBroker } from "./broker.js";
import { requireEnv } from "./env.js";
import { handlePayload } from "./pipeline.js";
import { prismaPushEndpointStore } from "./push-store.js";
import { prismaReadingStore } from "./store.js";
import { webPushPusher } from "./web-push.js";
import type { WarnDeps } from "./warn.js";

requireEnv("DATABASE_URL");
const broker = {
  url: requireEnv("MQTT_URL"),
  topic: requireEnv("MQTT_TOPIC"),
  username: requireEnv("MQTT_USERNAME"),
  password: requireEnv("MQTT_PASSWORD"),
};

/** No VAPID keys means no leak warnings: the app still stores every Reading, it just warns nobody. */
function leakWarnings(prisma: PrismaClient): WarnDeps | null {
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) {
    console.warn("ingest: VAPID keys unset, leak warnings will not be pushed");
    return null;
  }

  return {
    store: prismaPushEndpointStore(prisma),
    pusher: webPushPusher({
      subject: requireEnv("VAPID_SUBJECT"),
      publicKey,
      privateKey,
    }),
  };
}

const prisma = createPrismaClient();
const store = prismaReadingStore(prisma);
const warn = leakWarnings(prisma);
let client: MqttClient | undefined;
let shuttingDown = false;

function reportAndExit(error: unknown): void {
  console.error(error);
  Sentry.captureException(error);
  void Sentry.flush(2000).finally(() => process.exit(1));
}

process.on("uncaughtException", reportAndExit);
process.on("unhandledRejection", reportAndExit);

async function shutdown(): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  await client?.endAsync().catch(() => {});
  await prisma.$disconnect().catch(() => {});
  process.exit(0);
}

process.on("SIGINT", () => void shutdown());
process.on("SIGTERM", () => void shutdown());

// A Reading is compared against the Meter's last stored one, so payloads cannot overlap.
let queue: Promise<void> = Promise.resolve();

function enqueue(payload: Buffer): void {
  queue = queue
    .then(async () => {
      const result = await handlePayload({ store, warn }, payload, new Date());
      if (result.status !== "rejected") return;

      Sentry.captureMessage("ingest: Reading rejected, Consumption fell", {
        level: "error",
        extra: {
          meterId: result.reading.meterId.toString(),
          consumption: result.reading.consumption,
          lastConsumption: result.lastConsumption,
        },
      });
      console.error(
        `ingest: rejected a Reading for meter ${result.reading.meterId}: ${result.reading.consumption} < ${result.lastConsumption} gallons`,
      );
    })
    .catch((error: unknown) => {
      console.error(error);
      Sentry.captureException(error);
    });
}

async function main(): Promise<void> {
  await prisma.$queryRaw`SELECT 1`;
  console.log("ingest: database reachable");

  client = subscribeToBroker(broker, enqueue);

  if (process.env.INGEST_DEBUG_SENTRY === "1") {
    throw new Error("Sentry test error from the meter-reader ingest service");
  }
}

main().catch(reportAndExit);

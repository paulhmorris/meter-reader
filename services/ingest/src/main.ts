import "./instrument.js";

import * as Sentry from "@sentry/node";
import { createPrismaClient } from "@meter-reader/db";
import { requireEnv } from "./env.js";

requireEnv("DATABASE_URL");

const prisma = createPrismaClient();
let keepAlive: NodeJS.Timeout | undefined;
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
  clearInterval(keepAlive);
  await prisma.$disconnect().catch(() => {});
  process.exit(0);
}

process.on("SIGINT", () => void shutdown());
process.on("SIGTERM", () => void shutdown());

async function main(): Promise<void> {
  await prisma.$queryRaw`SELECT 1`;
  console.log("ingest: database reachable, waiting for work");

  // Nothing subscribes to MQTT yet (#2); hold the process open so `npm run dev` keeps both up.
  keepAlive = setInterval(() => {}, 60_000);

  if (process.env.INGEST_DEBUG_SENTRY === "1") {
    throw new Error("Sentry test error from the meter-reader ingest service");
  }
}

main().catch(reportAndExit);

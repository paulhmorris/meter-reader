/**
 * Dev-only: pretends the SDR heard the Meter reporting a leak, running the real ingest pipeline
 * so real Leak Warnings go out. Usage: npx tsx --env-file-if-exists=../../.env fake-leak.ts [meterId] [0|1|2]
 */
import { createPrismaClient } from "@meter-reader/db";
import { handlePayload } from "./src/pipeline.js";
import { prismaPushEndpointStore } from "./src/push-store.js";
import { prismaReadingStore } from "./src/store.js";
import { webPushPusher } from "./src/web-push.js";

const meterId = BigInt(process.argv[2] ?? "1234567890");
const leaknow = Number(process.argv[3] ?? "2");

const prisma = createPrismaClient();
const last = await prisma.reading.findFirst({
  where: { meterId },
  orderBy: [{ receivedAt: "desc" }, { id: "desc" }],
});

const payload = Buffer.from(
  JSON.stringify({
    model: "Neptune-R900",
    id: Number(meterId),
    // The R900 counter is in tenths of a gallon (ADR-0002), one tenth above the last Reading.
    consumption: Math.round(Number(last?.consumption ?? 0) * 10) + 1,
    leaknow,
    leak: last?.leakHistory ?? 0,
    backflow: 0,
    nouse: 0,
  }),
);

const result = await handlePayload(
  {
    store: prismaReadingStore(prisma),
    warn: {
      store: prismaPushEndpointStore(prisma),
      pusher: webPushPusher({
        subject: process.env.VAPID_SUBJECT ?? "mailto:you@example.com",
        publicKey: process.env.VAPID_PUBLIC_KEY ?? "",
        privateKey: process.env.VAPID_PRIVATE_KEY ?? "",
      }),
    },
  },
  payload,
  new Date(),
);

console.log(`meter ${meterId}: leaknow ${last?.activeLeak ?? 0} -> ${leaknow},`, result);
console.log("live endpoints:", await prismaPushEndpointStore(prisma).liveEndpoints(meterId));
await prisma.$disconnect();

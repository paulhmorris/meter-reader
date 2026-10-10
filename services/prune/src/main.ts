import "./instrument.js";

import * as Sentry from "@sentry/node";
import { createPrismaClient } from "@meter-reader/db";
import { pruneReadings } from "./prune.js";
import { msUntilNextPrune } from "./schedule.js";
import { prismaPruneStore } from "./store.js";

const prisma = createPrismaClient();
let timer: NodeJS.Timeout | undefined;

async function prune(): Promise<void> {
  const deleted = await pruneReadings(prismaPruneStore(prisma), new Date());
  console.log(
    `prune: deleted ${deleted.hour} Readings thinning to one an hour, ${deleted.day} to one a day, ${deleted.week} to one a week`,
  );
}

/** A failed night is reported and retried the next night: a prune left undone only delays thinning. */
function scheduleNext(): void {
  timer = setTimeout(() => {
    prune()
      .catch((error: unknown) => {
        console.error(error);
        Sentry.captureException(error);
      })
      .finally(scheduleNext);
  }, msUntilNextPrune(new Date()));
}

async function shutdown(): Promise<void> {
  clearTimeout(timer);
  await prisma.$disconnect().catch(() => {});
  process.exit(0);
}

process.on("SIGINT", () => void shutdown());
process.on("SIGTERM", () => void shutdown());

if (process.argv.includes("--once")) {
  prune()
    .then(() => shutdown())
    .catch(async (error: unknown) => {
      console.error(error);
      Sentry.captureException(error);
      await Sentry.flush(2000).catch(() => {});
      await prisma.$disconnect().catch(() => {});
      process.exit(1);
    });
} else {
  scheduleNext();
}

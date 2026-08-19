import "./instrument.js";

import * as Sentry from "@sentry/node";
import { createPrismaClient } from "@meter-reader/db";
import { pruneReadings } from "./prune.js";
import { prismaPruneStore } from "./store.js";

const prisma = createPrismaClient();

async function main(): Promise<void> {
  const deleted = await pruneReadings(prismaPruneStore(prisma), new Date());
  console.log(
    `prune: deleted ${deleted.hour} Readings thinning to one an hour, ${deleted.day} to one a day, ${deleted.week} to one a week`,
  );
}

main()
  .then(async () => {
    await prisma.$disconnect().catch(() => {});
    process.exit(0);
  })
  .catch(async (error: unknown) => {
    console.error(error);
    Sentry.captureException(error);
    await Sentry.flush(2000).catch(() => {});
    await prisma.$disconnect().catch(() => {});
    process.exit(1);
  });

import { createPrismaClient, type PrismaClient } from "@meter-reader/db";

let client: PrismaClient | undefined;

/** Lazy so a bad DATABASE_URL surfaces through the health route instead of at import time. */
export function prisma(): PrismaClient {
  return (client ??= createPrismaClient());
}

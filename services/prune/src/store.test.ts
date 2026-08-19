import type { PrismaClient } from "@meter-reader/db";
import { describe, expect, it } from "vitest";
import { prismaPruneStore } from "./store.js";

interface Call {
  model: string;
  operation: string;
  args: Record<string, unknown>;
}

/** Records what the store asks Postgres for, and refuses anything but Meters and Readings. */
function stubPrisma(calls: Call[]): PrismaClient {
  const record = (model: string, operation: string, result: unknown) => (args: unknown) => {
    calls.push({ model, operation, args: args as Record<string, unknown> });
    return Promise.resolve(result);
  };

  return new Proxy(
    {
      meter: { findMany: record("meter", "findMany", [{ id: 7n }]) },
      reading: {
        findMany: record("reading", "findMany", []),
        deleteMany: record("reading", "deleteMany", { count: 2 }),
      },
    },
    {
      get(target, property) {
        if (property in target) return target[property as keyof typeof target];
        throw new Error(`the prune must not touch ${String(property)}`);
      },
    },
  ) as unknown as PrismaClient;
}

const window = { start: new Date("2026-06-20T00:00:00Z"), end: new Date("2026-08-12T00:00:00Z") };

describe("prismaPruneStore", () => {
  it("scans a window oldest first, resuming after the cursor", async () => {
    const calls: Call[] = [];
    const cursor = { receivedAt: new Date("2026-07-01T00:00:00Z"), id: 4n };

    await prismaPruneStore(stubPrisma(calls)).readingsInWindow(7n, window, cursor, 500);

    expect(calls[0].args).toEqual({
      where: {
        meterId: 7n,
        receivedAt: { gte: window.start, lt: window.end },
        OR: [
          { receivedAt: { gt: cursor.receivedAt } },
          { receivedAt: cursor.receivedAt, id: { gt: 4n } },
        ],
      },
      orderBy: [{ receivedAt: "asc" }, { id: "asc" }],
      take: 500,
      select: { id: true, receivedAt: true },
    });
  });

  it("deletes Readings by id and nothing else, so Meter Events survive", async () => {
    const calls: Call[] = [];

    const deleted = await prismaPruneStore(stubPrisma(calls)).deleteReadings([1n, 2n]);

    expect(deleted).toBe(2);
    expect(calls).toEqual([
      { model: "reading", operation: "deleteMany", args: { where: { id: { in: [1n, 2n] } } } },
    ]);
  });
});

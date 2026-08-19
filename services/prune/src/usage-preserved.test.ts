import { describe, expect, it } from "vitest";
import { fakeStore, type FakeReading } from "./fake-store.js";
import { pruneReadings } from "./prune.js";
import { bucketKey, type Tier } from "./tiers.js";

const now = new Date("2026-08-19T06:30:00Z");
const MINUTE_MS = 60 * 1000;
const DAY_MS = 24 * 60 * MINUTE_MS;

let nextId = 1n;
let consumption = 481_320.5;

/** Quarter-hourly Readings whose Consumption climbs by an uneven pattern, as a real Meter's does. */
function block(days: number, hours: number): FakeReading[] {
  const pattern = [0, 0, 0.4, 12.7, 3.1, 0, 0, 1.8, 24.5, 0, 0.6, 0];
  const start = now.getTime() - days * DAY_MS;

  return Array.from({ length: hours * 4 }, (_, index) => {
    consumption += pattern[index % pattern.length];
    return {
      id: nextId++,
      meterId: 1n,
      consumption: Math.round(consumption * 10) / 10,
      receivedAt: new Date(start + index * 15 * MINUTE_MS),
    };
  });
}

/**
 * Usage per bucket, as the app derives it: the last Consumption in the bucket minus the last one
 * before it. The first bucket is left out, having no Reading before it to be a difference from.
 */
function usageByBucket(readings: FakeReading[], tier: Tier): Map<string, number> {
  const ordered = [...readings].sort((a, b) => a.receivedAt.getTime() - b.receivedAt.getTime());
  const last = new Map<string, number>();
  for (const reading of ordered) last.set(bucketKey(tier, reading.receivedAt), reading.consumption);

  const usage = new Map<string, number>();
  let opening: number | undefined;
  for (const [bucket, closing] of last) {
    if (opening !== undefined) usage.set(bucket, Math.round((closing - opening) * 10) / 10);
    opening = closing;
  }

  return usage;
}

function within(readings: FakeReading[], from: Date, to: Date): FakeReading[] {
  return readings.filter((reading) => reading.receivedAt >= from && reading.receivedAt < to);
}

function daysAgo(days: number): Date {
  return new Date(now.getTime() - days * DAY_MS);
}

describe("a prune", () => {
  it("leaves the Usage of every period the UI shows for that age unchanged", async () => {
    const raw = block(3, 6);
    const hourly = block(30, 30);
    const daily = block(100, 30 * 24);
    const weekly = block(400, 30 * 24);
    const store = fakeStore([...raw, ...hourly, ...daily, ...weekly]);
    const before = store.readings;

    await pruneReadings(store, now);
    const after = store.readings;

    for (const [tier, from, to] of [
      ["hour", daysAgo(7), now],
      ["hour", daysAgo(60), daysAgo(7)],
      ["day", daysAgo(365), daysAgo(60)],
      ["week", new Date(0), daysAgo(365)],
    ] as const) {
      expect(
        usageByBucket(within(after, from, to), tier),
        `${tier} Usage from ${from.toISOString()}`,
      ).toEqual(usageByBucket(within(before, from, to), tier));
    }
  });
});

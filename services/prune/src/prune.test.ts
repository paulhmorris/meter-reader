import { describe, expect, it } from "vitest";
import { fakeStore, type FakeReading } from "./fake-store.js";
import { pruneReadings } from "./prune.js";
import { bucketKey } from "./tiers.js";

const now = new Date("2026-08-19T06:30:00Z");
const MINUTE_MS = 60 * 1000;
const DAY_MS = 24 * 60 * MINUTE_MS;

let nextId = 1n;

/** Quarter-hourly Readings for one Meter, from the hour `days` before now, running for `count`. */
function every15Minutes(days: number, count: number, meterId = 1n): FakeReading[] {
  const start = Math.floor((now.getTime() - days * DAY_MS) / (60 * MINUTE_MS)) * 60 * MINUTE_MS;
  return Array.from({ length: count }, (_, index) => ({
    id: nextId++,
    meterId,
    consumption: 1000 + index,
    receivedAt: new Date(start + index * 15 * MINUTE_MS),
  }));
}

function remaining(store: { readings: FakeReading[] }): bigint[] {
  return store.readings.map((reading) => reading.id).sort((a, b) => Number(a - b));
}

describe("pruneReadings", () => {
  it("keeps only the last Reading of each hour between 7 and 60 days old", async () => {
    const readings = every15Minutes(30, 8);
    const store = fakeStore(readings);

    const deleted = await pruneReadings(store, now);

    expect(deleted.hour).toBe(6);
    expect(remaining(store)).toEqual([readings[3].id, readings[7].id]);
  });

  it("leaves Readings from the last 7 days alone", async () => {
    const readings = every15Minutes(2, 8);
    const store = fakeStore(readings);

    const deleted = await pruneReadings(store, now);

    expect(deleted).toEqual({ hour: 0, day: 0, week: 0 });
    expect(remaining(store)).toEqual(readings.map((reading) => reading.id));
  });

  it("thins Readings older than 60 days to one a day, and older than a year to one a week", async () => {
    const days = every15Minutes(100, 4 * 24 * 2);
    const weeks = every15Minutes(400, 4 * 24 * 9);
    const store = fakeStore([...days, ...weeks]);

    const deleted = await pruneReadings(store, now);

    expect(deleted.day).toBe(days.length - dayBuckets(days));
    expect(deleted.week).toBe(weeks.length - dayBuckets(weeks, "week"));
    expect(store.readings).toHaveLength(dayBuckets(days) + dayBuckets(weeks, "week"));
  });

  it("changes nothing on a second run", async () => {
    const store = fakeStore([
      ...every15Minutes(30, 8),
      ...every15Minutes(100, 8),
      ...every15Minutes(400, 8),
    ]);
    await pruneReadings(store, now);
    const afterFirst = remaining(store);

    const deleted = await pruneReadings(store, now);

    expect(deleted).toEqual({ hour: 0, day: 0, week: 0 });
    expect(remaining(store)).toEqual(afterFirst);
  });

  it("keeps one Reading an hour even when a bucket straddles two batches", async () => {
    const readings = every15Minutes(30, 8);
    const store = fakeStore(readings);

    const deleted = await pruneReadings(store, now, { batchSize: 3 });

    expect(deleted.hour).toBe(6);
    expect(remaining(store)).toEqual([readings[3].id, readings[7].id]);
    expect(store.deleteCalls).toBeGreaterThan(1);
  });

  it("prunes every Meter", async () => {
    const first = every15Minutes(30, 8, 1n);
    const second = every15Minutes(30, 8, 2n);
    const store = fakeStore([...first, ...second]);

    await pruneReadings(store, now);

    expect(remaining(store)).toEqual(
      [first[3].id, first[7].id, second[3].id, second[7].id].sort((a, b) => Number(a - b)),
    );
  });
});

function dayBuckets(readings: FakeReading[], tier: "day" | "week" = "day"): number {
  return new Set(readings.map((reading) => bucketKey(tier, reading.receivedAt))).size;
}

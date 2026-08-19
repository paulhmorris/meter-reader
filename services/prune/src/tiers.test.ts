import { describe, expect, it } from "vitest";
import { bucketKey, tierWindows } from "./tiers.js";

const now = new Date("2026-08-19T06:30:00Z");
const DAY_MS = 24 * 60 * 60 * 1000;

function daysAgo(days: number): Date {
  return new Date(now.getTime() - days * DAY_MS);
}

describe("tierWindows", () => {
  it("leaves the last 7 days of Readings raw", () => {
    const covered = tierWindows(now);
    expect(covered.every((window) => window.end <= daysAgo(7))).toBe(true);
    expect(covered.find((window) => window.tier === "hour")?.end).toEqual(daysAgo(7));
  });

  it("covers every age older than 7 days without a gap", () => {
    const [week, day, hour] = tierWindows(now).sort(
      (a, b) => a.start.getTime() - b.start.getTime(),
    );

    expect(week.tier).toBe("week");
    expect(week.end).toEqual(daysAgo(365));
    expect(day.tier).toBe("day");
    expect(day.start).toEqual(daysAgo(365));
    expect(day.end).toEqual(daysAgo(60));
    expect(hour.tier).toBe("hour");
    expect(hour.start).toEqual(daysAgo(60));
  });
});

describe("bucketKey", () => {
  it("buckets by the clock hour", () => {
    expect(bucketKey("hour", new Date("2026-03-04T05:00:00Z"))).toBe(
      bucketKey("hour", new Date("2026-03-04T05:59:59Z")),
    );
    expect(bucketKey("hour", new Date("2026-03-04T05:59:59Z"))).not.toBe(
      bucketKey("hour", new Date("2026-03-04T06:00:00Z")),
    );
  });

  // Usage is bucketed into Chicago days, so a day bucket has to be one too or a day's Usage moves.
  it("buckets by the Chicago day, not the UTC one", () => {
    expect(bucketKey("day", new Date("2026-03-04T05:00:00Z"))).toBe(
      bucketKey("day", new Date("2026-03-03T23:00:00Z")),
    );
    expect(bucketKey("day", new Date("2026-03-04T06:00:01Z"))).not.toBe(
      bucketKey("day", new Date("2026-03-04T05:00:00Z")),
    );
  });

  it("buckets a whole Chicago week together", () => {
    const monday = new Date("2026-03-02T12:00:00Z");
    const sunday = new Date("2026-03-08T12:00:00Z");
    const nextMonday = new Date("2026-03-09T12:00:00Z");

    expect(bucketKey("week", monday)).toBe(bucketKey("week", sunday));
    expect(bucketKey("week", nextMonday)).not.toBe(bucketKey("week", sunday));
  });
});

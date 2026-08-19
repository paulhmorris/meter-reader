import { describe, expect, it } from "vitest";
import { resolveRange } from "./ranges.js";

/** A Wednesday afternoon in Chicago's summer offset of UTC-5. */
const now = new Date("2026-08-19T18:30:00Z");

function resolve(query: string) {
  return resolveRange(new URLSearchParams(query), now);
}

describe("presets", () => {
  it("shows today by the hour when nothing is asked for", () => {
    const range = resolve("");

    expect(range).toMatchObject({
      preset: "today",
      granularity: "hour",
      drilled: false,
      drillTo: null,
    });
    expect(range.from.toISOString()).toBe("2026-08-19T05:00:00.000Z");
    expect(range.to).toEqual(now);
  });

  it("counts 7d and 30d back in whole Chicago days, today included", () => {
    expect(resolve("range=7d").from.toISOString()).toBe("2026-08-13T05:00:00.000Z");
    expect(resolve("range=30d").from.toISOString()).toBe("2026-07-21T05:00:00.000Z");
    expect(resolve("range=30d").granularity).toBe("day");
  });

  it("shows twelve months, the one in progress included", () => {
    const range = resolve("range=12mo");

    expect(range.granularity).toBe("month");
    expect(range.from.toISOString()).toBe("2025-09-01T05:00:00.000Z");
  });

  it("falls back to today when the preset is not one we offer", () => {
    expect(resolve("range=all-time").preset).toBe("today");
  });
});

describe("drill-down", () => {
  it("fills the day holding the instant with hours", () => {
    const range = resolve("range=30d&g=hour&at=2026-08-11T05:00:00.000Z");

    expect(range).toMatchObject({
      preset: "30d",
      granularity: "hour",
      drilled: true,
      drillTo: null,
    });
    expect(range.from.toISOString()).toBe("2026-08-11T05:00:00.000Z");
    expect(range.to.toISOString()).toBe("2026-08-12T04:59:59.999Z");
  });

  it("fills a week with days and a month with weeks", () => {
    const week = resolve("g=day&at=2026-08-11T05:00:00.000Z");
    const month = resolve("g=week&at=2026-07-11T05:00:00.000Z");

    expect(week.from.toISOString()).toBe("2026-08-10T05:00:00.000Z");
    expect(week.drillTo).toBe("hour");
    expect(month.from.toISOString()).toBe("2026-07-01T05:00:00.000Z");
    expect(month.to.toISOString()).toBe("2026-08-01T04:59:59.999Z");
    expect(month.drillTo).toBe("day");
  });

  it("stops a window still running at now, not at its end", () => {
    expect(resolve("g=hour&at=2026-08-19T12:00:00.000Z").to).toEqual(now);
  });

  it("names the views above it, coarsest first", () => {
    const range = resolve("range=12mo&g=hour&at=2026-08-19T12:00:00.000Z");

    expect(range.trail.map((view) => [view.granularity, view.at.toISOString()])).toEqual([
      ["week", "2026-08-01T05:00:00.000Z"],
      ["day", "2026-08-17T05:00:00.000Z"],
    ]);
  });

  it("keeps no trail above a month of weeks, which the preset already holds", () => {
    expect(resolve("g=week&at=2026-08-11T05:00:00.000Z").trail).toEqual([]);
  });

  it("falls back to the preset for a granularity we do not bucket by", () => {
    const range = resolve("range=7d&g=minute&at=2026-08-19T12:00:00.000Z");

    expect(range).toMatchObject({ preset: "7d", granularity: "day", drilled: false, trail: [] });
  });

  it("falls back to the preset for an unreadable or future window", () => {
    expect(resolve("g=hour&at=whenever").granularity).toBe("hour");
    expect(resolve("g=hour&at=whenever").trail).toEqual([]);
    expect(resolve("range=7d&g=hour&at=2026-09-01T12:00:00.000Z").granularity).toBe("day");
  });
});

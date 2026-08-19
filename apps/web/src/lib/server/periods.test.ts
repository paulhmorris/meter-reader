import { describe, expect, it } from "vitest";
import { daysBefore, periods } from "./periods.js";

/** Chicago springs forward on 2026-03-08 and falls back on 2026-11-01. */
const springForward = new Date("2026-03-08T12:00:00Z");
const fallBack = new Date("2026-11-01T12:00:00Z");

describe("daily periods", () => {
  it("starts each day at midnight in Chicago, not at midnight UTC", () => {
    const [day] = periods("day", {
      from: new Date("2026-06-15T10:00:00Z"),
      to: new Date("2026-06-15T11:00:00Z"),
    });

    expect(day.start.toISOString()).toBe("2026-06-15T05:00:00.000Z");
    expect(day.end.toISOString()).toBe("2026-06-16T05:00:00.000Z");
  });

  it("gives the spring-forward day 23 hours", () => {
    const [day] = periods("day", { from: springForward, to: springForward });

    expect(day.start.toISOString()).toBe("2026-03-08T06:00:00.000Z");
    expect(day.end.toISOString()).toBe("2026-03-09T05:00:00.000Z");
  });

  it("gives the fall-back day 25 hours", () => {
    const [day] = periods("day", { from: fallBack, to: fallBack });

    expect(day.start.toISOString()).toBe("2026-11-01T05:00:00.000Z");
    expect(day.end.toISOString()).toBe("2026-11-02T06:00:00.000Z");
  });

  it("covers every day from the one holding from to the one holding to", () => {
    const days = periods("day", {
      from: new Date("2026-03-06T18:00:00Z"),
      to: new Date("2026-03-10T18:00:00Z"),
    });

    expect(days.map((day) => day.start.toISOString())).toEqual([
      "2026-03-06T06:00:00.000Z",
      "2026-03-07T06:00:00.000Z",
      "2026-03-08T06:00:00.000Z",
      "2026-03-09T05:00:00.000Z",
      "2026-03-10T05:00:00.000Z",
    ]);
  });
});

describe("hourly periods", () => {
  it("runs from the start of the hour holding from", () => {
    const [hour] = periods("hour", {
      from: new Date("2026-06-15T10:31:07Z"),
      to: new Date("2026-06-15T10:45:00Z"),
    });

    expect(hour.start.toISOString()).toBe("2026-06-15T10:00:00.000Z");
    expect(hour.end.toISOString()).toBe("2026-06-15T11:00:00.000Z");
  });

  it("has 23 hours on the spring-forward day and 25 on the fall-back day", () => {
    const forward = periods("hour", {
      from: new Date("2026-03-08T06:00:00Z"),
      to: new Date("2026-03-09T04:59:59Z"),
    });
    const back = periods("hour", {
      from: new Date("2026-11-01T05:00:00Z"),
      to: new Date("2026-11-02T05:59:59Z"),
    });

    expect(forward).toHaveLength(23);
    expect(back).toHaveLength(25);
  });

  it("labels both fall-back hours, an hour of elapsed time apart", () => {
    const hours = periods("hour", {
      from: new Date("2026-11-01T06:00:00Z"),
      to: new Date("2026-11-01T07:00:00Z"),
    });

    expect(hours.map((hour) => hour.start.toISOString())).toEqual([
      "2026-11-01T06:00:00.000Z",
      "2026-11-01T07:00:00.000Z",
    ]);
  });
});

describe("daysBefore", () => {
  it("counts whole Chicago days back, across a change of offset", () => {
    expect(daysBefore(new Date("2026-11-03T12:00:00Z"), 3).toISOString()).toBe(
      "2026-10-31T05:00:00.000Z",
    );
    expect(daysBefore(new Date("2026-06-15T10:00:00Z"), 0).toISOString()).toBe(
      "2026-06-15T05:00:00.000Z",
    );
  });
});

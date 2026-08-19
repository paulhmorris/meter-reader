import { describe, expect, it } from "vitest";
import { leakIntervals, overlapsLeak } from "./leaks.js";

const from = new Date("2026-08-01T00:00:00Z");
const to = new Date("2026-08-04T00:00:00Z");
const at = (day: number, hour = 0) => new Date(Date.UTC(2026, 7, day, hour));

describe("leakIntervals", () => {
  it("pairs a leak starting with the leak stopping", () => {
    expect(
      leakIntervals(
        [
          { to: 1, occurredAt: at(1, 6) },
          { to: 0, occurredAt: at(2, 6) },
        ],
        { from, to },
      ),
    ).toEqual([{ start: at(1, 6), end: at(2, 6) }]);
  });

  it("leaves a leak that has not stopped open-ended", () => {
    expect(leakIntervals([{ to: 2, occurredAt: at(2) }], { from, to })).toEqual([
      { start: at(2), end: null },
    ]);
  });

  it("reports a leak open before the window from the window's start", () => {
    expect(
      leakIntervals(
        [
          { to: 1, occurredAt: at(-5) },
          { to: 0, occurredAt: at(2) },
        ],
        { from, to },
      ),
    ).toEqual([{ start: from, end: at(2) }]);
  });

  it("ignores a leak that both started and stopped before the window", () => {
    expect(
      leakIntervals(
        [
          { to: 1, occurredAt: at(-5) },
          { to: 0, occurredAt: at(-4) },
        ],
        { from, to },
      ),
    ).toEqual([]);
  });

  it("treats a change of kind as one unbroken leak", () => {
    expect(
      leakIntervals(
        [
          { to: 1, occurredAt: at(1) },
          { to: 2, occurredAt: at(2) },
          { to: 0, occurredAt: at(3) },
        ],
        { from, to },
      ),
    ).toEqual([{ start: at(1), end: at(3) }]);
  });

  it("counts a flag the meter does not document as leaking", () => {
    expect(leakIntervals([{ to: 7, occurredAt: at(1) }], { from, to })).toEqual([
      { start: at(1), end: null },
    ]);
  });
});

describe("overlapsLeak", () => {
  const period = { start: at(2), end: at(3) };

  it("is true when a leak runs through the period", () => {
    expect(overlapsLeak(period, [{ start: at(1), end: at(4) }])).toBe(true);
  });

  it("is true when a leak starts partway through", () => {
    expect(overlapsLeak(period, [{ start: at(2, 12), end: null }])).toBe(true);
  });

  it("is false for a leak that stopped as the period began", () => {
    expect(overlapsLeak(period, [{ start: at(1), end: at(2) }])).toBe(false);
  });

  it("is false for a leak that starts as the period ends", () => {
    expect(overlapsLeak(period, [{ start: at(3), end: null }])).toBe(false);
  });
});

import { describe, expect, it } from "vitest";
import { msUntilNextPrune } from "./schedule.js";

const HOUR_MS = 60 * 60 * 1000;

describe("msUntilNextPrune", () => {
  it("waits for 09:00 UTC later the same day", () => {
    expect(msUntilNextPrune(new Date("2026-10-09T06:00:00Z"))).toBe(3 * HOUR_MS);
  });

  it("waits for tomorrow once today's 09:00 UTC has passed", () => {
    expect(msUntilNextPrune(new Date("2026-10-09T10:00:00Z"))).toBe(23 * HOUR_MS);
  });

  it("waits a full day when called exactly at 09:00 UTC", () => {
    expect(msUntilNextPrune(new Date("2026-10-09T09:00:00Z"))).toBe(24 * HOUR_MS);
  });
});

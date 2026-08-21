import { describe, expect, it } from "vitest";
import { activeLeakLevel, leakHistoryLabel, meterHealth, parseMeterId } from "./meter.js";

const HOUR = 60 * 60 * 1000;

describe("parseMeterId", () => {
  it("reads the 32-bit id from the transmission", () => {
    expect(parseMeterId("1234567890")).toBe(1_234_567_890n);
    expect(parseMeterId("0")).toBe(0n);
    expect(parseMeterId("4294967295")).toBe(4_294_967_295n);
  });

  it("refuses anything that is not a 32-bit id", () => {
    expect(parseMeterId("4294967296")).toBeNull();
    expect(parseMeterId("-1")).toBeNull();
    expect(parseMeterId("1.5")).toBeNull();
    expect(parseMeterId("01")).toBeNull();
    expect(parseMeterId("abc")).toBeNull();
    expect(parseMeterId("")).toBeNull();
  });
});

describe("meterHealth", () => {
  const now = new Date("2026-08-19T12:00:00Z");
  const ago = (ms: number) => new Date(now.getTime() - ms);

  it("is fresh while the Meter has been heard from within a day", () => {
    expect(meterHealth(ago(23 * HOUR), now)).toBe("fresh");
    expect(meterHealth(ago(24 * HOUR - 1), now)).toBe("fresh");
  });

  it("is stale once a day has passed with nothing heard", () => {
    expect(meterHealth(ago(24 * HOUR), now)).toBe("stale");
    expect(meterHealth(ago(3 * 24 * HOUR - 1), now)).toBe("stale");
  });

  it("is broken once three days have passed with nothing heard", () => {
    expect(meterHealth(ago(3 * 24 * HOUR), now)).toBe("broken");
    expect(meterHealth(ago(30 * 24 * HOUR), now)).toBe("broken");
  });
});

describe("activeLeakLevel", () => {
  it("reads the leaknow flag as none, intermittent or continuous", () => {
    expect(activeLeakLevel(0)).toBe("none");
    expect(activeLeakLevel(1)).toBe("intermittent");
    expect(activeLeakLevel(2)).toBe("continuous");
  });

  it("keeps a flag it does not know as a leak, without naming its kind", () => {
    expect(activeLeakLevel(3)).toBe("unknown");
    expect(activeLeakLevel(255)).toBe("unknown");
  });
});

describe("leakHistoryLabel", () => {
  it("names the bucket the meter reports, never a number of days", () => {
    expect(leakHistoryLabel(0)).toBe("None");
    expect(leakHistoryLabel(1)).toBe("1–2 days");
    expect(leakHistoryLabel(2)).toBe("3–7 days");
    expect(leakHistoryLabel(3)).toBe("8–14 days");
    expect(leakHistoryLabel(4)).toBe("15–21 days");
    expect(leakHistoryLabel(5)).toBe("22–34 days");
    expect(leakHistoryLabel(6)).toBe("35+ days");
  });

  it("has no label for a bucket outside the seven the meter can report", () => {
    expect(leakHistoryLabel(7)).toBeNull();
    expect(leakHistoryLabel(-1)).toBeNull();
  });
});

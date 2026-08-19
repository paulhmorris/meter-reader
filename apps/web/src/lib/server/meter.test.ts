import { describe, expect, it } from "vitest";
import { meterHealth, parseMeterId } from "./meter.js";

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

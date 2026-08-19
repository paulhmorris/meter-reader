import { describe, expect, it } from "vitest";
import { parseMeterId } from "./meter.js";

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

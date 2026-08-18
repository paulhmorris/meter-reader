import { describe, expect, it } from "vitest";
import { parseR900 } from "./r900.js";

function payload(fields: Record<string, unknown>): Buffer {
  return Buffer.from(
    JSON.stringify({
      model: "Neptune-R900",
      id: 1234567,
      consumption: 1234,
      leaknow: 0,
      leak: 0,
      backflow: 0,
      nouse: 0,
      ...fields,
    }),
  );
}

describe("parseR900", () => {
  it("normalises the raw counter to gallons, its last digit being tenths", () => {
    expect(parseR900(payload({ consumption: 1234 }))?.consumption).toBe("123.4");
  });

  it("reads the meter id as a 32-bit bigint", () => {
    expect(parseR900(payload({ id: 4294967295 }))?.meterId).toBe(4294967295n);
  });

  it("ignores another model on the same topic", () => {
    expect(parseR900(payload({ model: "Acurite-Tower" }))).toBeNull();
  });

  it("ignores a message that is not JSON", () => {
    expect(parseR900(Buffer.from("not json"))).toBeNull();
  });

  it("reads the flags the meter reports alongside the counter", () => {
    expect(parseR900(payload({ leaknow: 1, leak: 3, backflow: 2, nouse: 5 }))?.flags).toEqual({
      activeLeak: 1,
      leakHistory: 3,
      backflow: 2,
      noUse: 5,
    });
  });

  it("ignores a message missing the fields a Reading needs", () => {
    expect(parseR900(Buffer.from(JSON.stringify({ model: "Neptune-R900", id: 1 })))).toBeNull();
    expect(parseR900(payload({ id: "1234567" }))).toBeNull();
    expect(parseR900(payload({ consumption: -1 }))).toBeNull();
  });

  it("ignores a message whose flags are missing or out of range", () => {
    expect(parseR900(payload({ leaknow: undefined }))).toBeNull();
    expect(parseR900(payload({ leak: -1 }))).toBeNull();
    expect(parseR900(payload({ backflow: "2" }))).toBeNull();
    expect(parseR900(payload({ nouse: 256 }))).toBeNull();
  });

  it("ignores an id wider than the 32 bits a Meter is identified by", () => {
    expect(parseR900(payload({ id: 4294967296 }))).toBeNull();
  });
});

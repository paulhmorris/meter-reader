import { describe, expect, it } from "vitest";
import { parseR900 } from "./r900.js";

function payload(fields: Record<string, unknown>): Buffer {
  return Buffer.from(
    JSON.stringify({ model: "Neptune-R900", id: 1234567, consumption: 1234, ...fields }),
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

  it("ignores a message missing the fields a Reading needs", () => {
    expect(parseR900(Buffer.from(JSON.stringify({ model: "Neptune-R900", id: 1 })))).toBeNull();
    expect(parseR900(payload({ id: "1234567" }))).toBeNull();
    expect(parseR900(payload({ consumption: -1 }))).toBeNull();
  });

  it("ignores an id wider than the 32 bits a Meter is identified by", () => {
    expect(parseR900(payload({ id: 4294967296 }))).toBeNull();
  });
});

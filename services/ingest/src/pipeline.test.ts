import { describe, expect, it } from "vitest";
import { handlePayload } from "./pipeline.js";
import type { ReadingStore } from "./record.js";

function fakeStore(last: string | null): ReadingStore & { saved: string[] } {
  const saved: string[] = [];
  return {
    saved,
    lastConsumption: async () => last,
    save: async (reading) => {
      saved.push(reading.consumption);
    },
  };
}

const receivedAt = new Date("2026-08-18T12:00:00Z");
const r900 = Buffer.from(JSON.stringify({ model: "Neptune-R900", id: 1234567, consumption: 1234 }));

describe("handlePayload", () => {
  it("stores the Reading an R900 transmission carries", async () => {
    const store = fakeStore("100.0");

    expect(await handlePayload(store, r900, receivedAt)).toEqual({ status: "stored" });
    expect(store.saved).toEqual(["123.4"]);
  });

  it("ignores a malformed payload without touching the store", async () => {
    const store = fakeStore("100.0");

    expect(await handlePayload(store, Buffer.from("<not json>"), receivedAt)).toEqual({
      status: "ignored",
    });
    expect(store.saved).toEqual([]);
  });

  it("ignores a transmission from another model on the same topic", async () => {
    const store = fakeStore(null);
    const other = Buffer.from(JSON.stringify({ model: "Acurite-Tower", id: 1, temperature_C: 20 }));

    expect(await handlePayload(store, other, receivedAt)).toEqual({ status: "ignored" });
    expect(store.saved).toEqual([]);
  });

  it("rejects a transmission whose Consumption has fallen", async () => {
    const store = fakeStore("200.0");

    expect(await handlePayload(store, r900, receivedAt)).toEqual({
      status: "rejected",
      reading: { meterId: 1234567n, consumption: "123.4" },
      lastConsumption: "200.0",
    });
    expect(store.saved).toEqual([]);
  });
});

import { describe, expect, it } from "vitest";
import { recordReading, type ReadingStore } from "./record.js";

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

describe("recordReading", () => {
  it("stores a Reading whose Consumption has risen", async () => {
    const store = fakeStore("100.0");
    const result = await recordReading(store, { meterId: 1n, consumption: "100.1" }, receivedAt);

    expect(result).toEqual({ status: "stored" });
    expect(store.saved).toEqual(["100.1"]);
  });

  it("stores the first Reading from a Meter never heard from before", async () => {
    const store = fakeStore(null);
    const result = await recordReading(store, { meterId: 1n, consumption: "8.0" }, receivedAt);

    expect(result).toEqual({ status: "stored" });
    expect(store.saved).toEqual(["8.0"]);
  });

  it("stores a Heartbeat Reading identical to the last one", async () => {
    const store = fakeStore("100.0");
    const result = await recordReading(store, { meterId: 1n, consumption: "100.0" }, receivedAt);

    expect(result).toEqual({ status: "stored" });
    expect(store.saved).toEqual(["100.0"]);
  });

  it("rejects a Reading below the Meter's last Consumption without storing it", async () => {
    const store = fakeStore("100.0");
    const reading = { meterId: 1n, consumption: "99.9" };
    const result = await recordReading(store, reading, receivedAt);

    expect(result).toEqual({ status: "rejected", reading, lastConsumption: "100.0" });
    expect(store.saved).toEqual([]);
  });
});

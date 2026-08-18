import { describe, expect, it } from "vitest";
import type { R900Flags, R900Reading } from "./r900.js";
import { recordReading, type ReadingStore, type StoredReading } from "./record.js";

const quiet: R900Flags = { activeLeak: 0, leakHistory: 0, backflow: 0, noUse: 0 };
const receivedAt = new Date("2026-08-18T12:00:00Z");

function reading(fields: Partial<R900Reading> = {}): R900Reading {
  return { meterId: 1n, consumption: "100.0", flags: quiet, ...fields };
}

function fakeStore(last: StoredReading | null): ReadingStore & { saved: R900Reading[] } {
  const saved: R900Reading[] = [];
  return {
    saved,
    lastReading: async () => last,
    save: async (reading) => {
      saved.push(reading);
    },
  };
}

function lastStored(fields: Partial<StoredReading> = {}): StoredReading {
  return { consumption: "100.0", flags: quiet, receivedAt, ...fields };
}

function minutesAfter(minutes: number, millis = 0): Date {
  return new Date(receivedAt.getTime() + minutes * 60_000 + millis);
}

describe("recordReading", () => {
  it("stores a Reading whose Consumption has risen", async () => {
    const store = fakeStore(lastStored());
    const result = await recordReading(store, reading({ consumption: "100.1" }), receivedAt);

    expect(result).toEqual({ status: "stored" });
    expect(store.saved).toEqual([reading({ consumption: "100.1" })]);
  });

  it("stores the first Reading from a Meter never heard from before", async () => {
    const store = fakeStore(null);
    const result = await recordReading(store, reading({ consumption: "8.0" }), receivedAt);

    expect(result).toEqual({ status: "stored" });
    expect(store.saved).toEqual([reading({ consumption: "8.0" })]);
  });

  it("rejects a Reading below the Meter's last Consumption without storing it", async () => {
    const store = fakeStore(lastStored());
    const fallen = reading({ consumption: "99.9" });
    const result = await recordReading(store, fallen, receivedAt);

    expect(result).toEqual({ status: "rejected", reading: fallen, lastConsumption: "100.0" });
    expect(store.saved).toEqual([]);
  });

  it("suppresses a Reading identical to the Meter's last stored one", async () => {
    const store = fakeStore(lastStored());
    const result = await recordReading(store, reading(), minutesAfter(1));

    expect(result).toEqual({ status: "suppressed" });
    expect(store.saved).toEqual([]);
  });

  it.each([
    ["Active Leak", { activeLeak: 1 }],
    ["Leak History", { leakHistory: 3 }],
    ["backflow", { backflow: 2 }],
    ["no-use", { noUse: 5 }],
  ])("stores a Reading whose %s flag has changed at unchanged Consumption", async (_, flag) => {
    const store = fakeStore(lastStored());
    const changed = reading({ flags: { ...quiet, ...flag } });
    const result = await recordReading(store, changed, minutesAfter(1));

    expect(result).toEqual({ status: "stored" });
    expect(store.saved).toEqual([changed]);
  });

  it("suppresses an identical Reading until 15 minutes have passed", async () => {
    const store = fakeStore(lastStored());

    expect(await recordReading(store, reading(), minutesAfter(15, -1))).toEqual({
      status: "suppressed",
    });
    expect(store.saved).toEqual([]);
  });

  it("stores an identical Reading as a Heartbeat once 15 minutes have passed", async () => {
    const store = fakeStore(lastStored());
    const result = await recordReading(store, reading(), minutesAfter(15));

    expect(result).toEqual({ status: "heartbeat" });
    expect(store.saved).toEqual([reading()]);
  });

  it("measures the Heartbeat interval per Meter, not globally", async () => {
    const saved: R900Reading[] = [];
    const lastPerMeter = new Map<bigint, StoredReading>([
      [1n, lastStored({ receivedAt: minutesAfter(-30) })],
      [2n, lastStored({ receivedAt: minutesAfter(-1) })],
    ]);
    const store: ReadingStore = {
      lastReading: async (meterId) => lastPerMeter.get(meterId) ?? null,
      save: async (reading) => {
        saved.push(reading);
      },
    };

    expect(await recordReading(store, reading({ meterId: 1n }), receivedAt)).toEqual({
      status: "heartbeat",
    });
    expect(await recordReading(store, reading({ meterId: 2n }), receivedAt)).toEqual({
      status: "suppressed",
    });
    expect(saved).toEqual([reading({ meterId: 1n })]);
  });
});

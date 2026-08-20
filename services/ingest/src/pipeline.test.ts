import { describe, expect, it } from "vitest";
import { handlePayload } from "./pipeline.js";
import type { R900Flags, R900Reading } from "./r900.js";
import type { ReadingStore, StoredReading } from "./record.js";
import type { LeakWarning, PushEndpoint, WarnDeps } from "./warn.js";

const quiet: R900Flags = { activeLeak: 0, leakHistory: 0, backflow: 0, noUse: 0 };
const receivedAt = new Date("2026-08-18T12:00:00Z");

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

const r900 = Buffer.from(
  JSON.stringify({
    model: "Neptune-R900",
    id: 1234567,
    consumption: 1234,
    leaknow: 0,
    leak: 0,
    backflow: 0,
    nouse: 0,
  }),
);
const transmitted: R900Reading = {
  meterId: 1234567n,
  consumption: "123.4",
  flags: quiet,
  signal: { rssi: null, snr: null },
};

const endpoint: PushEndpoint = {
  id: "one",
  endpoint: "https://push.example.com/one",
  p256dh: "key",
  auth: "secret",
};

function fakeWarn(): WarnDeps & { pushed: LeakWarning[] } {
  const pushed: LeakWarning[] = [];
  return {
    pushed,
    store: { liveEndpoints: async () => [endpoint], forget: async () => {} },
    pusher: {
      send: async (_endpoint, warning) => {
        pushed.push(warning);
        return "sent";
      },
    },
  };
}

describe("handlePayload", () => {
  it("stores the Reading an R900 transmission carries", async () => {
    const store = fakeStore({ consumption: "100.0", flags: quiet, receivedAt });

    expect(await handlePayload({ store, warn: null }, r900, receivedAt)).toEqual({
      status: "stored",
      events: [],
    });
    expect(store.saved).toEqual([transmitted]);
  });

  it("ignores a malformed payload without touching the store", async () => {
    const store = fakeStore(null);

    expect(
      await handlePayload({ store, warn: null }, Buffer.from("<not json>"), receivedAt),
    ).toEqual({
      status: "ignored",
    });
    expect(store.saved).toEqual([]);
  });

  it("ignores a transmission from another model on the same topic", async () => {
    const store = fakeStore(null);
    const other = Buffer.from(JSON.stringify({ model: "Acurite-Tower", id: 1, temperature_C: 20 }));

    expect(await handlePayload({ store, warn: null }, other, receivedAt)).toEqual({
      status: "ignored",
    });
    expect(store.saved).toEqual([]);
  });

  it("suppresses a transmission identical to the Meter's last stored Reading", async () => {
    const store = fakeStore({ consumption: "123.4", flags: quiet, receivedAt });

    expect(
      await handlePayload({ store, warn: null }, r900, new Date(receivedAt.getTime() + 60_000)),
    ).toEqual({
      status: "suppressed",
    });
    expect(store.saved).toEqual([]);
  });

  it("rejects a transmission whose Consumption has fallen", async () => {
    const store = fakeStore({ consumption: "200.0", flags: quiet, receivedAt });

    expect(await handlePayload({ store, warn: null }, r900, receivedAt)).toEqual({
      status: "rejected",
      reading: transmitted,
      lastConsumption: "200.0",
    });
    expect(store.saved).toEqual([]);
  });

  it("warns subscribed devices about a leak the Reading opened", async () => {
    const store = fakeStore({ consumption: "100.0", flags: quiet, receivedAt });
    const warn = fakeWarn();
    const leaking = Buffer.from(
      JSON.stringify({
        model: "Neptune-R900",
        id: 1234567,
        consumption: 1234,
        leaknow: 2,
        leak: 0,
        backflow: 0,
        nouse: 0,
      }),
    );

    await handlePayload({ store, warn }, leaking, receivedAt);

    expect(warn.pushed).toEqual([
      {
        title: "Meter 1234567 is reporting a leak",
        body: "Water has run through it without a break for a day.",
        url: "/meter/1234567",
      },
    ]);
  });

  it("warns nobody about a Reading that opened no leak", async () => {
    const store = fakeStore({ consumption: "100.0", flags: quiet, receivedAt });
    const warn = fakeWarn();

    await handlePayload({ store, warn }, r900, receivedAt);

    expect(warn.pushed).toEqual([]);
  });
});

import { describe, expect, it, vi } from "vitest";
import {
  issueClaimCode,
  meterSummaries,
  signIn,
  type AdminStore,
  type MeterStats,
} from "./admin.js";
import { createRateLimiter } from "./rate-limit.js";

const now = new Date("2026-08-19T12:00:00Z");
const meterId = 1_234_567_890n;
const password = "correct horse battery staple";

function store(overrides: Partial<AdminStore> = {}): AdminStore {
  return {
    hasMeter: async () => true,
    meters: async () => [],
    activeClaimCode: async () => null,
    rotateClaimCode: async () => {},
    grants: async () => [],
    revokeGrant: async () => false,
    ...overrides,
  };
}

function limiter() {
  return createRateLimiter({ limit: 10, windowMs: 60_000 });
}

describe("signIn", () => {
  it("admits the Admin who knows the password", () => {
    expect(
      signIn({ limiter: limiter() }, { password, expected: password, client: "1.2.3.4", now }),
    ).toBe("granted");
  });

  it("turns away a guess of the wrong length as it turns away one of the right length", () => {
    const deps = { limiter: limiter() };
    expect(signIn(deps, { password: "x", expected: password, client: "1.2.3.4", now })).toBe(
      "rejected",
    );
  });

  it("turns away anyone who does not", () => {
    expect(
      signIn(
        { limiter: limiter() },
        { password: "guess", expected: password, client: "1.2.3.4", now },
      ),
    ).toBe("rejected");
  });

  it("turns away everyone while no password is configured", () => {
    expect(
      signIn({ limiter: limiter() }, { password: "", expected: "", client: "1.2.3.4", now }),
    ).toBe("rejected");
  });

  it("rate-limits a client that keeps guessing", () => {
    const deps = { limiter: createRateLimiter({ limit: 2, windowMs: 60_000 }) };
    const attempt = { password: "guess", expected: password, client: "1.2.3.4", now };
    signIn(deps, attempt);
    signIn(deps, attempt);

    expect(signIn(deps, { ...attempt, password })).toBe("rate-limited");
  });
});

describe("meterSummaries", () => {
  function stats(overrides: Partial<MeterStats> = {}): MeterStats {
    return {
      id: 1n,
      latest: {
        receivedAt: new Date("2026-08-19T11:00:00Z"),
        consumption: 481_320.5,
        activeLeak: 0,
        leakHistory: 0,
        backflow: 0,
        noUse: 0,
      },
      consumptionBefore: 481_200.5,
      readings: 96,
      rssi: -6.5,
      snr: 18.25,
      devices: 2,
      ...overrides,
    };
  }

  it("says of every Meter when it was last heard, whether it is Stale and whether it leaks", async () => {
    const summaries = await meterSummaries(
      store({
        meters: async () => [
          stats({ id: 1n, latest: { ...stats().latest!, activeLeak: 2 } }),
          stats({
            id: 2n,
            latest: { ...stats().latest!, receivedAt: new Date("2026-08-16T12:00:00Z") },
          }),
        ],
      }),
      now,
    );

    expect(
      summaries.map(({ id, lastHeardAt, health, activeLeak }) => ({
        id,
        lastHeardAt,
        health,
        activeLeak,
      })),
    ).toEqual([
      {
        id: 1n,
        lastHeardAt: new Date("2026-08-19T11:00:00Z"),
        health: "fresh",
        activeLeak: "continuous",
      },
      {
        id: 2n,
        lastHeardAt: new Date("2026-08-16T12:00:00Z"),
        health: "broken",
        activeLeak: "none",
      },
    ]);
  });

  it("carries the Meter's own flags, its Consumption and the last day's Usage", async () => {
    const [summary] = await meterSummaries(
      store({
        meters: async () => [
          stats({ latest: { ...stats().latest!, leakHistory: 2, backflow: 1, noUse: 0 } }),
        ],
      }),
      now,
    );

    expect(summary).toMatchObject({
      leakHistory: "3–7 days",
      leakHistoryBucket: 2,
      backflow: true,
      noUse: false,
      consumption: 481_320.5,
      usage: 120,
      readings: 96,
      rssi: -6.5,
      snr: 18.25,
      devices: 2,
    });
  });

  it("leaves the last day's Usage unsaid where no Reading before it survives to difference against", async () => {
    const [summary] = await meterSummaries(
      store({ meters: async () => [stats({ consumptionBefore: null })] }),
      now,
    );

    expect(summary.usage).toBeNull();
    expect(summary.consumption).toBe(481_320.5);
  });

  it("shows a Meter never heard from rather than hiding it", async () => {
    const summaries = await meterSummaries(
      store({
        meters: async () => [
          stats({ latest: null, consumptionBefore: null, readings: 0, rssi: null, snr: null }),
        ],
      }),
      now,
    );

    expect(summaries).toEqual([
      {
        id: 1n,
        lastHeardAt: null,
        health: null,
        activeLeak: null,
        leakHistory: null,
        leakHistoryBucket: 0,
        backflow: false,
        noUse: false,
        consumption: null,
        usage: null,
        readings: 0,
        rssi: null,
        snr: null,
        devices: 2,
      },
    ]);
  });
});

describe("issueClaimCode", () => {
  it("hands back the new code once, and stores it against the Meter", async () => {
    const rotateClaimCode = vi.fn(async () => {});
    const code = await issueClaimCode(store({ rotateClaimCode }), { meterId, now });

    expect(code).toMatch(/^[0-9A-Z]{20}$/);
    expect(rotateClaimCode).toHaveBeenCalledWith({ meterId, code, now });
  });

  it("issues a different code every time, so rotating replaces the old one", async () => {
    const first = await issueClaimCode(store(), { meterId, now });
    const second = await issueClaimCode(store(), { meterId, now });
    expect(first).not.toBe(second);
  });
});

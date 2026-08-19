import { describe, expect, it, vi } from "vitest";
import { issueClaimCode, meterSummaries, signIn, type AdminStore } from "./admin.js";
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
  it("says of every Meter when it was last heard, whether it is Stale and whether it leaks", async () => {
    const summaries = await meterSummaries(
      store({
        meters: async () => [
          { id: 1n, latest: { receivedAt: new Date("2026-08-19T11:00:00Z"), activeLeak: 2 } },
          { id: 2n, latest: { receivedAt: new Date("2026-08-16T12:00:00Z"), activeLeak: 0 } },
        ],
      }),
      now,
    );

    expect(summaries).toEqual([
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

  it("shows a Meter never heard from rather than hiding it", async () => {
    const summaries = await meterSummaries(
      store({ meters: async () => [{ id: 1n, latest: null }] }),
      now,
    );
    expect(summaries).toEqual([{ id: 1n, lastHeardAt: null, health: null, activeLeak: null }]);
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

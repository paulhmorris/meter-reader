import { describe, expect, it, vi } from "vitest";
import { claim, resolveGrant, type AccessStore } from "./access.js";
import { formatClaimCode } from "./claim-code.js";
import { createRateLimiter } from "./rate-limit.js";
import { signGrantId } from "./grant-cookie.js";

const secret = "a-test-secret";
const now = new Date("2026-08-18T12:00:00Z");
const code = "0123456789ABCDEFGHJK";
const meterId = 1_234_567_890n;

function store(overrides: Partial<AccessStore> = {}): AccessStore {
  return {
    meterForClaimCode: async () => null,
    createGrant: async () => "grant-1",
    activeGrant: async () => null,
    ...overrides,
  };
}

function limiter() {
  return createRateLimiter({ limit: 10, windowMs: 60_000 });
}

describe("claim", () => {
  const granting = { meterForClaimCode: async () => meterId };

  it("creates a Grant for the Meter the Claim Code names", async () => {
    const createGrant = vi.fn(async () => "grant-1");
    const result = await claim(
      { store: store({ ...granting, createGrant }), limiter: limiter() },
      {
        code,
        client: "1.2.3.4",
        device: null,
        now,
      },
    );

    expect(result).toEqual({ status: "granted", grantId: "grant-1", meterId });
    expect(createGrant).toHaveBeenCalledWith({ meterId, claimCode: code, device: null, now });
  });

  it("accepts the Claim Code as the Admin hands it out", async () => {
    const meterForClaimCode = vi.fn(async () => meterId);
    await claim(
      { store: store({ ...granting, meterForClaimCode }), limiter: limiter() },
      {
        code: ` ${formatClaimCode(code).toLowerCase()} `,
        client: "1.2.3.4",
        device: null,
        now,
      },
    );

    expect(meterForClaimCode).toHaveBeenCalledWith(code);
  });

  it("gives every device its own Grant for the same Claim Code", async () => {
    let grants = 0;
    const deps = {
      store: store({ ...granting, createGrant: async () => `grant-${++grants}` }),
      limiter: limiter(),
    };

    const first = await claim(deps, { code, client: "1.2.3.4", device: null, now });
    const second = await claim(deps, { code, client: "5.6.7.8", device: null, now });

    expect([first, second]).toEqual([
      { status: "granted", grantId: "grant-1", meterId },
      { status: "granted", grantId: "grant-2", meterId },
    ]);
  });

  it("rejects an unknown code without saying whether the Meter exists", async () => {
    const result = await claim(
      { store: store(), limiter: limiter() },
      { code, client: "1.2.3.4", device: null, now },
    );
    expect(result).toEqual({ status: "rejected" });
  });

  it("rejects a code that could never be a Claim Code, without asking the database", async () => {
    const meterForClaimCode = vi.fn(async () => meterId);
    const result = await claim(
      { store: store({ meterForClaimCode }), limiter: limiter() },
      {
        code: "nope",
        client: "1.2.3.4",
        device: null,
        now,
      },
    );

    expect(result).toEqual({ status: "rejected" });
    expect(meterForClaimCode).not.toHaveBeenCalled();
  });

  it("rate-limits a client that keeps guessing", async () => {
    const deps = { store: store(), limiter: createRateLimiter({ limit: 2, windowMs: 60_000 }) };
    await claim(deps, { code, client: "1.2.3.4", device: null, now });
    await claim(deps, { code, client: "1.2.3.4", device: null, now });

    expect(await claim(deps, { code, client: "1.2.3.4", device: null, now })).toEqual({
      status: "rate-limited",
    });
  });

  it("counts a malformed guess against the limit too", async () => {
    const deps = { store: store(), limiter: createRateLimiter({ limit: 1, windowMs: 60_000 }) };
    await claim(deps, { code: "nope", client: "1.2.3.4", device: null, now });

    expect(await claim(deps, { code, client: "1.2.3.4", device: null, now })).toEqual({
      status: "rate-limited",
    });
  });
});

describe("resolveGrant", () => {
  const held = { activeGrant: async () => ({ id: "grant-1", meterId }) };

  it("resolves the Meter a signed cookie's Grant names", async () => {
    const activeGrant = vi.fn(async () => ({ id: "grant-1", meterId }));
    const grant = await resolveGrant(
      store({ activeGrant }),
      signGrantId("grant-1", secret),
      secret,
    );

    expect(grant).toEqual({ id: "grant-1", meterId });
    expect(activeGrant).toHaveBeenCalledWith("grant-1");
  });

  it("has no Grant when there is no cookie", async () => {
    expect(await resolveGrant(store(held), undefined, secret)).toBeNull();
  });

  it("refuses a cookie this app did not sign, without asking the database", async () => {
    const activeGrant = vi.fn(async () => ({ id: "grant-1", meterId }));
    expect(await resolveGrant(store({ activeGrant }), "grant-1.forged", secret)).toBeNull();
    expect(activeGrant).not.toHaveBeenCalled();
  });

  it("has no Grant when the store no longer honours the Grant id, as after a revocation", async () => {
    expect(await resolveGrant(store(), signGrantId("grant-1", secret), secret)).toBeNull();
  });
});

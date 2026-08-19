import { normalizeClaimCode } from "./claim-code.js";
import { readSignedGrantId } from "./grant-cookie.js";
import type { RateLimiter } from "./rate-limit.js";

export interface Grant {
  id: string;
  meterId: bigint;
}

export interface AccessStore {
  /** The Meter a Claim Code names, or null if no unrotated code matches. */
  meterForClaimCode(code: string): Promise<bigint | null>;
  createGrant(input: { meterId: bigint; claimCode: string; now: Date }): Promise<string>;
  /** The Grant, unless it has been revoked or never existed. */
  activeGrant(grantId: string): Promise<Grant | null>;
}

export interface AccessDeps {
  store: AccessStore;
  limiter: RateLimiter;
}

export type ClaimResult =
  | { status: "granted"; grantId: string; meterId: bigint }
  | { status: "rejected" }
  | { status: "rate-limited" };

/**
 * Turns an entered Claim Code into a Grant. A wrong code and an unknown one are the same
 * answer, so a guesser learns nothing about which Meters exist (ADR-0001).
 */
export async function claim(
  { store, limiter }: AccessDeps,
  { code, client, now }: { code: string; client: string; now: Date },
): Promise<ClaimResult> {
  if (!limiter.allow(client, now)) return { status: "rate-limited" };

  const claimCode = normalizeClaimCode(code);
  if (!claimCode) return { status: "rejected" };

  const meterId = await store.meterForClaimCode(claimCode);
  if (meterId === null) return { status: "rejected" };

  const grantId = await store.createGrant({ meterId, claimCode, now });
  return { status: "granted", grantId, meterId };
}

/** The Grant a request carries, or null if it carries none this app still honours. */
export async function resolveGrant(
  store: AccessStore,
  cookie: string | undefined,
  secret: string,
): Promise<Grant | null> {
  if (!cookie) return null;

  const grantId = readSignedGrantId(cookie, secret);
  if (!grantId) return null;

  return store.activeGrant(grantId);
}

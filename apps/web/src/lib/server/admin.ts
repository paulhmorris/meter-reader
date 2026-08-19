import { createHash, timingSafeEqual } from "node:crypto";
import { generateClaimCode } from "./claim-code.js";
import { activeLeakLevel, meterHealth, type ActiveLeakLevel, type MeterHealth } from "./meter.js";
import type { RateLimiter } from "./rate-limit.js";

export interface AdminGrant {
  id: string;
  createdAt: Date;
  /** What the device called itself when it claimed, so the Admin can tell one from another. */
  device: string | null;
}

export interface AdminStore {
  /** Whether the SDR has ever heard this Meter, there being nothing to administer otherwise. */
  hasMeter(meterId: bigint): Promise<boolean>;
  meters(): Promise<{ id: bigint; latest: { receivedAt: Date; activeLeak: number } | null }[]>;
  activeClaimCode(meterId: bigint): Promise<{ createdAt: Date } | null>;
  /** Stores the new code and stops every older one claiming, leaving their Grants alone. */
  rotateClaimCode(input: { meterId: bigint; code: string; now: Date }): Promise<void>;
  grants(meterId: bigint): Promise<AdminGrant[]>;
  /** Whether this Meter had that Grant still to revoke. */
  revokeGrant(input: { grantId: string; meterId: bigint; now: Date }): Promise<boolean>;
}

export type SignInResult = "granted" | "rejected" | "rate-limited";

/** The Admin surface is reached by a password the Admin alone holds, never by a Claim Code (ADR-0004). */
export function signIn(
  { limiter }: { limiter: RateLimiter },
  {
    password,
    expected,
    client,
    now,
  }: { password: string; expected: string; client: string; now: Date },
): SignInResult {
  if (!limiter.allow(client, now)) return "rate-limited";
  if (!expected) return "rejected";

  // Digests rather than the passwords themselves, so the comparison does not disclose a length.
  const presented = createHash("sha256").update(password).digest();
  const configured = createHash("sha256").update(expected).digest();

  return timingSafeEqual(presented, configured) ? "granted" : "rejected";
}

export interface MeterSummary {
  id: bigint;
  /** Null until the SDR has heard the Meter at all, which leaves nothing to judge it by. */
  lastHeardAt: Date | null;
  health: MeterHealth | null;
  activeLeak: ActiveLeakLevel | null;
}

export async function meterSummaries(store: AdminStore, now: Date): Promise<MeterSummary[]> {
  const meters = await store.meters();

  return meters.map(({ id, latest }) => ({
    id,
    lastHeardAt: latest?.receivedAt ?? null,
    health: latest ? meterHealth(latest.receivedAt, now) : null,
    activeLeak: latest ? activeLeakLevel(latest.activeLeak) : null,
  }));
}

/** Issues a Claim Code for the Meter and returns it, the one time the Admin gets to read it. */
export async function issueClaimCode(
  store: AdminStore,
  { meterId, now }: { meterId: bigint; now: Date },
): Promise<string> {
  const code = generateClaimCode();
  await store.rotateClaimCode({ meterId, code, now });
  return code;
}

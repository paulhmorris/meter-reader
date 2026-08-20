import { createHash, timingSafeEqual } from "node:crypto";
import { generateClaimCode } from "./claim-code.js";
import {
  activeLeakLevel,
  leakHistoryLabel,
  meterHealth,
  type ActiveLeakLevel,
  type MeterHealth,
} from "./meter.js";
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
  /** Every Meter with what the last day says about it, the window measured back from `now`. */
  meters(now: Date): Promise<MeterStats[]>;
  activeClaimCode(meterId: bigint): Promise<{ createdAt: Date } | null>;
  /** Stores the new code and stops every older one claiming, leaving their Grants alone. */
  rotateClaimCode(input: { meterId: bigint; code: string; now: Date }): Promise<void>;
  grants(meterId: bigint): Promise<AdminGrant[]>;
  /** Whether this Meter had that Grant still to revoke. */
  revokeGrant(input: { grantId: string; meterId: bigint; now: Date }): Promise<boolean>;
}

/** One Meter's latest Reading and what the last 24 hours of Readings amount to. */
export interface MeterStats {
  id: bigint;
  /** Null until the SDR has heard the Meter at all, which leaves nothing to judge it by. */
  latest: {
    receivedAt: Date;
    consumption: number;
    activeLeak: number;
    leakHistory: number;
    backflow: number;
    noUse: number;
  } | null;
  /** Consumption at the last Reading before the window opened, null when none survives it. */
  consumptionBefore: number | null;
  /** Readings stored inside the window, which is how well the SDR is hearing this Meter. */
  readings: number;
  /** Mean levels across the window, null unless rtl_433 is reporting them. */
  rssi: number | null;
  snr: number | null;
  /** Devices holding an unrevoked Grant. */
  devices: number;
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

/** How the Admin list describes one Meter: what it last reported, and how the last day went. */
export interface MeterSummary {
  id: bigint;
  /** Null until the SDR has heard the Meter at all, which leaves nothing to judge it by. */
  lastHeardAt: Date | null;
  health: MeterHealth | null;
  activeLeak: ActiveLeakLevel | null;
  /** The Leak History bucket's label, or null if the meter reported a bucket it cannot have. */
  leakHistory: string | null;
  /** The bucket itself, which is what orders one Meter's Leak History against another's. */
  leakHistoryBucket: number;
  backflow: boolean;
  noUse: boolean;
  /** The Meter's lifetime cumulative gallons at its latest Reading. */
  consumption: number | null;
  /** Gallons over the last 24 hours, null while no Reading before the window survives to difference against. */
  usage: number | null;
  /** Readings heard in the last 24 hours, against the 96 a Meter transmitting quietly still forces. */
  readings: number;
  /** Mean levels over the last 24 hours, null unless rtl_433 is reporting them. */
  rssi: number | null;
  snr: number | null;
  devices: number;
}

export async function meterSummaries(store: AdminStore, now: Date): Promise<MeterSummary[]> {
  const meters = await store.meters(now);

  return meters.map(({ id, latest, consumptionBefore, readings, rssi, snr, devices }) => ({
    id,
    lastHeardAt: latest?.receivedAt ?? null,
    health: latest ? meterHealth(latest.receivedAt, now) : null,
    activeLeak: latest ? activeLeakLevel(latest.activeLeak) : null,
    leakHistory: latest ? leakHistoryLabel(latest.leakHistory) : null,
    leakHistoryBucket: latest?.leakHistory ?? 0,
    backflow: (latest?.backflow ?? 0) > 0,
    noUse: (latest?.noUse ?? 0) > 0,
    consumption: latest?.consumption ?? null,
    usage: latest && consumptionBefore !== null ? latest.consumption - consumptionBefore : null,
    readings,
    rssi,
    snr,
    devices,
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

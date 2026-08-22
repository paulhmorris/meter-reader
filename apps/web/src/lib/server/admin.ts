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

/** One Reading as the Admin store hands it over, newest first. */
export interface StoredReading {
  id: bigint;
  receivedAt: Date;
  /** The Meter's lifetime cumulative total in gallons at this Reading. */
  consumption: number;
  /** The `leaknow` flag as the Meter reported it at this Reading. */
  activeLeak: number;
  rssi: number | null;
  snr: number | null;
}

export interface AdminStore {
  /** Whether the SDR has ever heard this Meter, there being nothing to administer otherwise. */
  hasMeter(meterId: bigint): Promise<boolean>;
  /** Every Meter with today's Usage and how the last 24 hours went, both judged from `now`. */
  meters(now: Date): Promise<MeterStats[]>;
  /** Where the Admin has written the Meter down as being, null while nothing is written. */
  address(meterId: bigint): Promise<string | null>;
  /** Writes down where the Meter is, or rubs it out when given nothing. */
  setAddress(input: { meterId: bigint; address: string | null }): Promise<void>;
  /** When the Admin disabled the Meter, null while it is in use. */
  disabledAt(meterId: bigint): Promise<Date | null>;
  /** Disables the Meter as of `now`, or puts it back in use when given null. */
  setDisabledAt(input: { meterId: bigint; disabledAt: Date | null }): Promise<void>;
  /** The Meter's claimable Claim Code, there being at most one, or null while none is. */
  activeClaimCode(meterId: bigint): Promise<{ code: string; createdAt: Date } | null>;
  /** Stores the new code and stops every older one claiming, leaving their Grants alone. */
  rotateClaimCode(input: { meterId: bigint; code: string; now: Date }): Promise<void>;
  /** The Meter's latest Readings, newest first, at most `limit` of them. */
  readings(meterId: bigint, limit: number): Promise<StoredReading[]>;
  grants(meterId: bigint): Promise<AdminGrant[]>;
  /** Whether this Meter had that Grant still to revoke. */
  revokeGrant(input: { grantId: string; meterId: bigint; now: Date }): Promise<boolean>;
}

/** One Meter's latest Reading, what today's Usage comes to and how the last 24 hours were heard. */
export interface MeterStats {
  id: bigint;
  /** Where the Admin has written the Meter down as being, null while nothing is written. */
  address: string | null;
  /** When the Admin disabled the Meter, null while it is in use. */
  disabledAt: Date | null;
  /** Null until the SDR has heard the Meter at all, which leaves nothing to judge it by. */
  latest: {
    receivedAt: Date;
    consumption: number;
    activeLeak: number;
    leakHistory: number;
    backflow: number;
    noUse: number;
  } | null;
  /** Consumption at the last Reading before today began, null when none survives it. */
  consumptionBefore: number | null;
  /** Consumption at today's first Reading, which opens the day where nothing precedes it. */
  consumptionOpening: number | null;
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
  /** Where the Admin has written the Meter down as being, null while nothing is written. */
  address: string | null;
  /** When the Admin disabled the Meter, null while it is in use. */
  disabledAt: Date | null;
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
  /** Gallons used since midnight, understated where the Meter was first heard after it. */
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

  return meters.map((meter) => {
    const { id, address, disabledAt, latest, consumptionBefore, consumptionOpening } = meter;
    const { readings, rssi, snr, devices } = meter;
    // Nothing precedes the first day the Meter was ever heard in, so its own first Reading opens
    // it: the Usage the stored Readings account for, understated (ADR-0002).
    const opening = consumptionBefore ?? consumptionOpening;

    return {
      id,
      address,
      disabledAt,
      lastHeardAt: latest?.receivedAt ?? null,
      health: latest ? meterHealth(latest.receivedAt, now) : null,
      activeLeak: latest ? activeLeakLevel(latest.activeLeak) : null,
      leakHistory: latest ? leakHistoryLabel(latest.leakHistory) : null,
      leakHistoryBucket: latest?.leakHistory ?? 0,
      backflow: (latest?.backflow ?? 0) > 0,
      noUse: (latest?.noUse ?? 0) > 0,
      consumption: latest?.consumption ?? null,
      usage:
        latest && opening !== null ? Math.round((latest.consumption - opening) * 10) / 10 : null,
      readings,
      rssi,
      snr,
      devices,
    };
  });
}

/** One Reading as the Admin page lists it, with what it added since the Reading before it. */
export interface AdminReading {
  id: string;
  receivedAt: Date;
  consumption: number;
  activeLeak: ActiveLeakLevel;
  rssi: number | null;
  snr: number | null;
  /** Gallons since the previous Reading, null for the oldest the Meter has, which has none behind it. */
  usage: number | null;
}

/**
 * The Meter's latest Readings with the Usage each one added. One more than asked for is read,
 * so the oldest shown has a Consumption behind it to difference against.
 */
export async function recentReadings(
  store: AdminStore,
  { meterId, count }: { meterId: bigint; count: number },
): Promise<AdminReading[]> {
  const readings = await store.readings(meterId, count + 1);

  return readings.slice(0, count).map((reading, index) => {
    const before = readings[index + 1];

    return {
      id: String(reading.id),
      receivedAt: reading.receivedAt,
      consumption: reading.consumption,
      activeLeak: activeLeakLevel(reading.activeLeak),
      rssi: reading.rssi,
      snr: reading.snr,
      usage: before ? reading.consumption - before.consumption : null,
    };
  });
}

/** A street line rather than a note, so anything past this is the Admin pasting by mistake. */
const ADDRESS_LIMIT = 120;

/** What the Admin typed, as one line, or null where they left it empty or cleared it. */
export function parseAddress(value: string): string | null {
  const address = value.replaceAll(/\s+/g, " ").trim().slice(0, ADDRESS_LIMIT).trim();
  return address === "" ? null : address;
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

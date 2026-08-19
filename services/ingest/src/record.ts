import type { R900Flags, R900Reading } from "./r900.js";

/** What the Meter's last stored Reading says, which every new transmission is judged against. */
export interface StoredReading {
  /** Gallons to one decimal place, in the same form parseR900 produces, so it compares as a string. */
  consumption: string;
  flags: R900Flags;
  receivedAt: Date;
}

/** The flags whose transitions are recorded as Meter Events; Leak History is a bucket, not a state. */
const EVENT_FLAGS = ["activeLeak", "backflow", "noUse"] as const;

export type MeterEventFlag = (typeof EVENT_FLAGS)[number];

/** One flag's move from one value to another, to be recorded alongside the Reading that showed it. */
export interface MeterEventDraft {
  flag: MeterEventFlag;
  from: number;
  to: number;
}

export interface ReadingStore {
  /** The Meter's last stored Reading, or null if it has never been heard from. */
  lastReading(meterId: bigint): Promise<StoredReading | null>;
  /** Writes the Reading and its Meter Events together, so neither can survive without the other. */
  save(reading: R900Reading, receivedAt: Date, events: MeterEventDraft[]): Promise<void>;
}

export type RecordResult =
  | { status: "stored"; events: MeterEventDraft[] }
  | { status: "heartbeat" }
  | { status: "suppressed" }
  | { status: "rejected"; reading: R900Reading; lastConsumption: string };

const HEARTBEAT_INTERVAL_MS = 15 * 60 * 1000;

function transitions(previous: R900Flags, next: R900Flags): MeterEventDraft[] {
  return EVENT_FLAGS.filter((flag) => previous[flag] !== next[flag]).map((flag) => ({
    flag,
    from: previous[flag],
    to: next[flag],
  }));
}

function sameFlags(a: R900Flags, b: R900Flags): boolean {
  return (
    a.activeLeak === b.activeLeak &&
    a.leakHistory === b.leakHistory &&
    a.backflow === b.backflow &&
    a.noUse === b.noUse
  );
}

/**
 * Stores one transmission and reports the Meter Events it produced, unless it says nothing new —
 * an identical one is dropped except as the 15-minute Heartbeat, which is what tells a silent
 * Meter apart from an unused one. Each flag that moved since the Meter's last stored Reading is
 * recorded as a Meter Event alongside it.
 *
 * A fallen Consumption means a wrapped counter, a swapped meter, or a corrupt packet, all of
 * which need a human (ADR-0002).
 */
export async function recordReading(
  store: ReadingStore,
  reading: R900Reading,
  receivedAt: Date,
): Promise<RecordResult> {
  const last = await store.lastReading(reading.meterId);
  if (last === null) {
    await store.save(reading, receivedAt, []);
    return { status: "stored", events: [] };
  }

  if (Number(reading.consumption) < Number(last.consumption)) {
    return { status: "rejected", reading, lastConsumption: last.consumption };
  }

  if (reading.consumption !== last.consumption || !sameFlags(reading.flags, last.flags)) {
    const events = transitions(last.flags, reading.flags);
    await store.save(reading, receivedAt, events);
    return { status: "stored", events };
  }

  if (receivedAt.getTime() - last.receivedAt.getTime() < HEARTBEAT_INTERVAL_MS) {
    return { status: "suppressed" };
  }

  await store.save(reading, receivedAt, []);
  return { status: "heartbeat" };
}

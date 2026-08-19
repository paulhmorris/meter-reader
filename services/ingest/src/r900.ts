import * as v from "valibot";

/** The flags a Meter reports alongside its counter, each a small bucketed code. */
export interface R900Flags {
  /** `leaknow`: 0 none, 1 intermittent, 2 continuous — a rolling 24-hour assessment. */
  activeLeak: number;
  /** `leak`: days on which a leak was seen, bucketed 0-6, never an exact number of days. */
  leakHistory: number;
  backflow: number;
  noUse: number;
}

/** One decoded R900 transmission, with Consumption already normalised to gallons. */
export interface R900Reading {
  meterId: bigint;
  /** Gallons, to one decimal place, as a string so no float artifact reaches Postgres. */
  consumption: string;
  flags: R900Flags;
}

/** rtl_433 names the R900 decoder's model this way; anything else shares the topic by accident. */
const R900_MODEL = "Neptune-R900";
const MAX_METER_ID = 0xffffffff;
const MAX_FLAG = 0xff;

const count = v.pipe(v.number(), v.safeInteger(), v.minValue(0));
const flag = v.pipe(count, v.maxValue(MAX_FLAG));

/** rtl_433 sends more fields than a Reading needs, so unknown keys are left alone. */
const transmission = v.pipe(
  v.object({
    model: v.literal(R900_MODEL),
    id: v.pipe(count, v.maxValue(MAX_METER_ID)),
    consumption: count,
    leaknow: flag,
    leak: flag,
    backflow: flag,
    nouse: flag,
  }),
  v.transform(({ id, consumption, leaknow, leak, backflow, nouse }): R900Reading => ({
    meterId: BigInt(id),
    consumption: (consumption / 10).toFixed(1),
    flags: { activeLeak: leaknow, leakHistory: leak, backflow, noUse: nouse },
  })),
);

/**
 * Decodes one rtl_433 MQTT payload into a Reading, or null for anything this service
 * has no business storing. The R900 counter's last digit is tenths (ADR-0002).
 */
export function parseR900(payload: Buffer): R900Reading | null {
  let json: unknown;
  try {
    json = JSON.parse(payload.toString());
  } catch {
    return null;
  }

  const result = v.safeParse(transmission, json);
  return result.success ? result.output : null;
}

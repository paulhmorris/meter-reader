/** One decoded R900 transmission, with Consumption already normalised to gallons. */
export interface R900Reading {
  meterId: bigint;
  /** Gallons, to one decimal place, as a string so no float artifact reaches Postgres. */
  consumption: string;
}

/** rtl_433 names the R900 decoder's model this way; anything else shares the topic by accident. */
const R900_MODEL = "Neptune-R900";
const MAX_METER_ID = 0xffffffff;

function isMeterId(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0 && (value as number) <= MAX_METER_ID;
}

function isCounter(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}

/**
 * Decodes one rtl_433 MQTT payload into a Reading, or null for anything this service
 * has no business storing. The R900 counter's last digit is tenths (ADR-0002).
 */
export function parseR900(payload: Buffer): R900Reading | null {
  let transmission: unknown;
  try {
    transmission = JSON.parse(payload.toString());
  } catch {
    return null;
  }

  if (typeof transmission !== "object" || transmission === null) return null;
  const { model, id, consumption } = transmission as Record<string, unknown>;

  if (model !== R900_MODEL) return null;
  if (!isMeterId(id) || !isCounter(consumption)) return null;

  return { meterId: BigInt(id), consumption: (consumption / 10).toFixed(1) };
}

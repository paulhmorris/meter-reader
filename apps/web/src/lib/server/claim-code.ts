import { randomBytes } from "node:crypto";

/** Crockford base32: no I, L, O or U, so a code read aloud or copied by hand survives. */
const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

/** 20 characters of base32 is 100 bits — the code alone selects a Meter, so it must survive guessing (ADR-0001). */
export const CLAIM_CODE_LENGTH = 20;

const GROUP_SIZE = 5;

export function generateClaimCode(random: (size: number) => Uint8Array = randomBytes): string {
  const bytes = random(CLAIM_CODE_LENGTH);
  let code = "";
  for (const byte of bytes) code += ALPHABET[byte % ALPHABET.length];
  return code;
}

/** The stored form of whatever the neighbour typed, or null if it could never be a Claim Code. */
export function normalizeClaimCode(input: string): string | null {
  const code = input
    .replaceAll(/[\s-]/g, "")
    .toUpperCase()
    .replaceAll(/[IL]/g, "1")
    .replaceAll("O", "0");

  if (code.length !== CLAIM_CODE_LENGTH) return null;
  if (![...code].every((character) => ALPHABET.includes(character))) return null;
  return code;
}

/** How a Claim Code is shown to the Admin and handed out. */
export function formatClaimCode(code: string): string {
  return (code.match(new RegExp(`.{1,${GROUP_SIZE}}`, "g")) ?? []).join("-");
}

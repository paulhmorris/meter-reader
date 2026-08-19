import { createHmac, timingSafeEqual } from "node:crypto";

const SEPARATOR = ".";

function sign(value: string, secret: string, purpose: string): string {
  return createHmac("sha256", secret).update(`${purpose}:${value}`).digest("base64url");
}

export function signValue(value: string, secret: string, purpose: string): string {
  return `${value}${SEPARATOR}${sign(value, secret, purpose)}`;
}

/**
 * The value inside a cookie this app signed for this purpose, or null if it did not sign it.
 * The purpose is part of what is signed, so a cookie cannot be replayed as another kind.
 */
export function readSignedValue(signed: string, secret: string, purpose: string): string | null {
  const separator = signed.lastIndexOf(SEPARATOR);
  if (separator <= 0) return null;

  const value = signed.slice(0, separator);
  const presented = Buffer.from(signed.slice(separator + 1), "base64url");
  const expected = Buffer.from(sign(value, secret, purpose), "base64url");

  if (presented.length !== expected.length) return null;
  return timingSafeEqual(presented, expected) ? value : null;
}

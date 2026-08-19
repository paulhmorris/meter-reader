import { createHmac, timingSafeEqual } from "node:crypto";

const SEPARATOR = ".";

function sign(grantId: string, secret: string): string {
  return createHmac("sha256", secret).update(grantId).digest("base64url");
}

export function signGrantId(grantId: string, secret: string): string {
  return `${grantId}${SEPARATOR}${sign(grantId, secret)}`;
}

/** The Grant named by a cookie this app signed, or null if it did not sign it. */
export function readSignedGrantId(cookie: string, secret: string): string | null {
  const separator = cookie.lastIndexOf(SEPARATOR);
  if (separator <= 0) return null;

  const grantId = cookie.slice(0, separator);
  const presented = Buffer.from(cookie.slice(separator + 1), "base64url");
  const expected = Buffer.from(sign(grantId, secret), "base64url");

  if (presented.length !== expected.length) return null;
  return timingSafeEqual(presented, expected) ? grantId : null;
}

export const GRANT_COOKIE = "grant";

/** A Grant is permanent until the Admin revokes it, so the cookie lives as long as browsers allow. */
export const GRANT_COOKIE_OPTIONS = {
  path: "/",
  httpOnly: true,
  sameSite: "lax",
  maxAge: 400 * 24 * 60 * 60,
} as const;

import { readSignedValue, signValue } from "./signed-value.js";

const PURPOSE = "grant";

export function signGrantId(grantId: string, secret: string): string {
  return signValue(grantId, secret, PURPOSE);
}

/** The Grant named by a cookie this app signed, or null if it did not sign it. */
export function readSignedGrantId(cookie: string, secret: string): string | null {
  return readSignedValue(cookie, secret, PURPOSE);
}

export const GRANT_COOKIE = "grant";

/**
 * A Grant is permanent until the Admin revokes it, so the cookie lives as long as browsers allow.
 * `secure` is set rather than left to SvelteKit, which reads it off the request protocol — http
 * behind the tunnel.
 */
export const GRANT_COOKIE_OPTIONS = {
  path: "/",
  httpOnly: true,
  secure: true,
  sameSite: "lax",
  maxAge: 400 * 24 * 60 * 60,
} as const;

import { createHmac } from "node:crypto";
import { readSignedValue, signValue } from "./signed-value.js";

const PURPOSE = "admin";

export const ADMIN_COOKIE = "admin";

/**
 * Signs Admin sessions. The password is part of the key, so changing ADMIN_PASSWORD ends every
 * session it issued — otherwise a leaked password could not be rotated (ADR-0004).
 */
export function adminSessionKey(secret: string, password: string): string {
  return createHmac("sha256", secret).update(password).digest("base64url");
}

/** The Admin signs in again once a week, the surface being far more than any one Grant reaches. */
export const ADMIN_SESSION_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export function signAdminSession(issuedAt: Date, secret: string): string {
  return signValue(String(issuedAt.getTime()), secret, PURPOSE);
}

/** Whether a cookie is an Admin session this app signed and has not yet outlived. */
export function isAdminSession(cookie: string | undefined, secret: string, now: Date): boolean {
  if (!cookie) return false;

  const value = readSignedValue(cookie, secret, PURPOSE);
  if (value === null) return false;

  const issuedAt = Number(value);
  if (!Number.isInteger(issuedAt)) return false;

  const age = now.getTime() - issuedAt;
  return age >= 0 && age < ADMIN_SESSION_MAX_AGE_MS;
}

/** `secure` is set for the reason `GRANT_COOKIE_OPTIONS` gives. */
export const ADMIN_COOKIE_OPTIONS = {
  path: "/",
  httpOnly: true,
  secure: true,
  sameSite: "lax",
  maxAge: ADMIN_SESSION_MAX_AGE_MS / 1000,
} as const;

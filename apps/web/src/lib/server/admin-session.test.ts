import { describe, expect, it } from "vitest";
import {
  ADMIN_COOKIE_OPTIONS,
  ADMIN_SESSION_MAX_AGE_MS,
  adminSessionKey,
  isAdminSession,
  signAdminSession,
} from "./admin-session.js";
import { signGrantId } from "./grant-cookie.js";
import { signValue } from "./signed-value.js";

const secret = "a-test-secret";
const issuedAt = new Date("2026-08-19T12:00:00Z");

function later(ms: number): Date {
  return new Date(issuedAt.getTime() + ms);
}

describe("isAdminSession", () => {
  it("recognises a session this app issued", () => {
    expect(isAdminSession(signAdminSession(issuedAt, secret), secret, issuedAt)).toBe(true);
  });

  it("has no session without a cookie", () => {
    expect(isAdminSession(undefined, secret, issuedAt)).toBe(false);
  });

  it("refuses a cookie this app did not sign", () => {
    expect(isAdminSession(`${issuedAt.getTime()}.forged`, secret, issuedAt)).toBe(false);
  });

  it("refuses a Grant cookie presented as an Admin session", () => {
    expect(isAdminSession(signGrantId("grant-1", secret), secret, issuedAt)).toBe(false);
  });

  it("expires a session once it is old enough", () => {
    const cookie = signAdminSession(issuedAt, secret);
    expect(isAdminSession(cookie, secret, later(ADMIN_SESSION_MAX_AGE_MS - 1))).toBe(true);
    expect(isAdminSession(cookie, secret, later(ADMIN_SESSION_MAX_AGE_MS))).toBe(false);
  });

  it("ends the sessions a password issued once that password changes", () => {
    const key = adminSessionKey(secret, "old-password");
    const cookie = signAdminSession(issuedAt, key);

    expect(isAdminSession(cookie, key, issuedAt)).toBe(true);
    expect(isAdminSession(cookie, adminSessionKey(secret, "new-password"), issuedAt)).toBe(false);
  });

  it("refuses a session that claims to have been issued in the future", () => {
    expect(isAdminSession(signAdminSession(later(60_000), secret), secret, issuedAt)).toBe(false);
  });

  it("refuses a session whose issue time is not a time", () => {
    expect(isAdminSession(signValue("soon", secret, "admin"), secret, issuedAt)).toBe(false);
  });
});

describe("Admin cookie options", () => {
  it("keeps the cookie off plain HTTP and out of scripts", () => {
    expect(ADMIN_COOKIE_OPTIONS.secure).toBe(true);
    expect(ADMIN_COOKIE_OPTIONS.httpOnly).toBe(true);
  });
});

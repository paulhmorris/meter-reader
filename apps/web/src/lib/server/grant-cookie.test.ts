import { describe, expect, it } from "vitest";
import { GRANT_COOKIE_OPTIONS, readSignedGrantId, signGrantId } from "./grant-cookie.js";

const secret = "a-test-secret";
const grantId = "01J8Z5X0000000000000000000";

describe("signed Grant cookie", () => {
  it("round-trips the Grant it names", () => {
    expect(readSignedGrantId(signGrantId(grantId, secret), secret)).toBe(grantId);
  });

  it("refuses a cookie signed with another secret", () => {
    expect(readSignedGrantId(signGrantId(grantId, "other-secret"), secret)).toBeNull();
  });

  it("refuses a cookie whose Grant id was swapped for another", () => {
    const [, signature] = signGrantId(grantId, secret).split(".");
    expect(readSignedGrantId(`someone-elses-grant.${signature}`, secret)).toBeNull();
  });

  it("refuses an unsigned or malformed cookie", () => {
    expect(readSignedGrantId(grantId, secret)).toBeNull();
    expect(readSignedGrantId("", secret)).toBeNull();
    expect(readSignedGrantId(`${grantId}.`, secret)).toBeNull();
    expect(readSignedGrantId(`${grantId}.not-base64url!`, secret)).toBeNull();
  });

  it("refuses a cookie with no Grant id", () => {
    const [, signature] = signGrantId("", secret).split(".");
    expect(readSignedGrantId(`.${signature}`, secret)).toBeNull();
  });

  it("keeps the Grant id readable in the cookie, with the signature appended", () => {
    expect(signGrantId(grantId, secret)).toMatch(new RegExp(`^${grantId}\\.[\\w-]{43}$`));
  });
});

describe("Grant cookie options", () => {
  it("keeps the cookie off plain HTTP and out of scripts", () => {
    expect(GRANT_COOKIE_OPTIONS.secure).toBe(true);
    expect(GRANT_COOKIE_OPTIONS.httpOnly).toBe(true);
  });
});

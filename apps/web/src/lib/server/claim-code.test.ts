import { describe, expect, it } from "vitest";
import {
  CLAIM_CODE_LENGTH,
  formatClaimCode,
  generateClaimCode,
  normalizeClaimCode,
} from "./claim-code.js";

describe("generateClaimCode", () => {
  it("produces a code of the full length from the Crockford alphabet", () => {
    const code = generateClaimCode();
    expect(code).toMatch(/^[0-9A-HJKMNP-TV-Z]{20}$/);
    expect(code).toHaveLength(CLAIM_CODE_LENGTH);
  });

  it("spends one byte of randomness per character, unbiased", () => {
    const bytes = Uint8Array.from({ length: CLAIM_CODE_LENGTH }, (_, i) => i);
    expect(generateClaimCode(() => bytes)).toBe("0123456789ABCDEFGHJK");
  });

  it("does not repeat itself", () => {
    const codes = new Set(Array.from({ length: 50 }, () => generateClaimCode()));
    expect(codes.size).toBe(50);
  });
});

describe("normalizeClaimCode", () => {
  const code = generateClaimCode();

  it("accepts a code exactly as generated", () => {
    expect(normalizeClaimCode(code)).toBe(code);
  });

  it("accepts the grouped form the Admin hands out", () => {
    expect(normalizeClaimCode(formatClaimCode(code))).toBe(code);
  });

  it("ignores case, spaces and separators", () => {
    expect(normalizeClaimCode(" 0123 456789-abcd efghjk ")).toBe("0123456789ABCDEFGHJK");
  });

  it("reads the letters Crockford excludes as the digits they look like", () => {
    expect(normalizeClaimCode("oOiIlL45678901234567")).toBe("00111145678901234567");
  });

  it("rejects a code of the wrong length", () => {
    expect(normalizeClaimCode("0123456789ABCDEFGHJ")).toBeNull();
    expect(normalizeClaimCode("0123456789ABCDEFGHJKM")).toBeNull();
    expect(normalizeClaimCode("")).toBeNull();
  });

  it("rejects characters outside the alphabet", () => {
    expect(normalizeClaimCode("U123456789ABCDEFGHJK")).toBeNull();
    expect(normalizeClaimCode("!123456789ABCDEFGHJK")).toBeNull();
  });
});

describe("formatClaimCode", () => {
  it("groups the code so it can be read aloud", () => {
    expect(formatClaimCode("0123456789ABCDEFGHJK")).toBe("01234-56789-ABCDE-FGHJK");
  });
});

import { describe, expect, it } from "vitest";
import { readSignedValue, signValue } from "./signed-value.js";

const secret = "a-test-secret";

describe("signed values", () => {
  it("reads back a value it signed", () => {
    expect(readSignedValue(signValue("grant-1", secret, "grant"), secret, "grant")).toBe("grant-1");
  });

  it("refuses a value signed for another purpose", () => {
    expect(readSignedValue(signValue("grant-1", secret, "grant"), secret, "admin")).toBeNull();
  });

  it("refuses a value signed with another secret", () => {
    expect(readSignedValue(signValue("grant-1", "other", "grant"), secret, "grant")).toBeNull();
  });

  it("refuses a signature of the wrong shape", () => {
    expect(readSignedValue("grant-1.forged", secret, "grant")).toBeNull();
    expect(readSignedValue("unsigned", secret, "grant")).toBeNull();
  });

  it("keeps a value that contains the separator", () => {
    expect(readSignedValue(signValue("1.2", secret, "admin"), secret, "admin")).toBe("1.2");
  });
});

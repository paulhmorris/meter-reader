import { describe, expect, it } from "vitest";
import { requireEnv } from "./env.js";

describe("requireEnv", () => {
  it("returns the value when set", () => {
    expect(requireEnv("DATABASE_URL", { DATABASE_URL: "postgres://x" })).toBe("postgres://x");
  });

  it("throws naming the variable when missing", () => {
    expect(() => requireEnv("DATABASE_URL", {})).toThrow("DATABASE_URL");
  });

  it("treats an empty value as missing", () => {
    expect(() => requireEnv("DATABASE_URL", { DATABASE_URL: "" })).toThrow("DATABASE_URL");
  });
});

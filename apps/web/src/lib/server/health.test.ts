import { describe, expect, it } from "vitest";
import { checkHealth } from "./health.js";

describe("checkHealth", () => {
  it("is healthy when the database probe resolves", async () => {
    expect(await checkHealth(async () => {})).toEqual({ status: "ok", database: "ok" });
  });

  it("is unhealthy and reports the reason when the probe rejects", async () => {
    const result = await checkHealth(async () => {
      throw new Error("connection refused");
    });

    expect(result).toEqual({ status: "error", database: "error", error: "connection refused" });
  });

  it("includes the error code, which is where Prisma puts the real cause", async () => {
    const result = await checkHealth(async () => {
      throw Object.assign(new Error("\nInvalid `prisma.$queryRaw()` invocation:\n\n\n"), {
        code: "ECONNREFUSED",
      });
    });

    expect(result.error).toBe("ECONNREFUSED: Invalid `prisma.$queryRaw()` invocation:");
  });

  it("stringifies a non-Error rejection", async () => {
    const result = await checkHealth(async () => {
      throw "nope";
    });

    expect(result.error).toBe("nope");
  });
});

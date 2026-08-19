import { describe, expect, it } from "vitest";
import { createRateLimiter } from "./rate-limit.js";

const minute = 60_000;
const start = new Date("2026-08-18T12:00:00Z");
const later = (ms: number) => new Date(start.getTime() + ms);

describe("createRateLimiter", () => {
  it("allows attempts up to the limit", () => {
    const limiter = createRateLimiter({ limit: 3, windowMs: minute });
    expect([1, 2, 3].map(() => limiter.allow("1.2.3.4", start))).toEqual([true, true, true]);
  });

  it("refuses the attempt after the limit", () => {
    const limiter = createRateLimiter({ limit: 2, windowMs: minute });
    limiter.allow("1.2.3.4", start);
    limiter.allow("1.2.3.4", start);
    expect(limiter.allow("1.2.3.4", start)).toBe(false);
  });

  it("counts each client separately", () => {
    const limiter = createRateLimiter({ limit: 1, windowMs: minute });
    limiter.allow("1.2.3.4", start);
    expect(limiter.allow("5.6.7.8", start)).toBe(true);
  });

  it("lets a blocked client back in once its window has passed", () => {
    const limiter = createRateLimiter({ limit: 1, windowMs: minute });
    limiter.allow("1.2.3.4", start);
    expect(limiter.allow("1.2.3.4", later(minute - 1))).toBe(false);
    expect(limiter.allow("1.2.3.4", later(minute))).toBe(true);
  });

  it("does not grow without bound as clients come and go", () => {
    const limiter = createRateLimiter({ limit: 1, windowMs: minute });
    for (let i = 0; i < 500; i++) limiter.allow(`10.0.0.${i}`, start);
    limiter.allow("1.2.3.4", later(minute));
    expect(limiter.size()).toBe(1);
  });
});

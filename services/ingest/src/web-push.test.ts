import { describe, expect, it } from "vitest";
import { WebPushError } from "web-push";
import { endpointGone } from "./web-push.js";

function rejected(statusCode: number): WebPushError {
  return new WebPushError("rejected", statusCode, {}, "", "https://push.example.com/one");
}

describe("endpointGone", () => {
  it("is a push service saying the endpoint no longer exists", () => {
    expect(endpointGone(rejected(404))).toBe(true);
    expect(endpointGone(rejected(410))).toBe(true);
  });

  it("is not a push service that is merely refusing or broken", () => {
    expect(endpointGone(rejected(400))).toBe(false);
    expect(endpointGone(rejected(429))).toBe(false);
    expect(endpointGone(rejected(500))).toBe(false);
  });

  it("is not a failure that never reached a push service", () => {
    expect(endpointGone(new Error("getaddrinfo ENOTFOUND"))).toBe(false);
  });
});

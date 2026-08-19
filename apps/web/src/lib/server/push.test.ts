import { describe, expect, it } from "vitest";
import { parseEndpointUrl, parsePushEndpoint } from "./push.js";

const subscription = {
  endpoint: "https://fcm.googleapis.com/fcm/send/abc123",
  keys: { p256dh: "BNc-key_material", auth: "auth-secret_1" },
};

describe("parsePushEndpoint", () => {
  it("takes what a push service issued", () => {
    expect(parsePushEndpoint(subscription)).toEqual({
      endpoint: subscription.endpoint,
      p256dh: "BNc-key_material",
      auth: "auth-secret_1",
    });
  });

  it("refuses an endpoint that is not an https URL", () => {
    expect(
      parsePushEndpoint({ ...subscription, endpoint: "http://push.example.com/x" }),
    ).toBeNull();
    expect(parsePushEndpoint({ ...subscription, endpoint: "javascript:alert(1)" })).toBeNull();
    expect(parsePushEndpoint({ ...subscription, endpoint: "/fcm/send/abc" })).toBeNull();
  });

  it("refuses an endpoint longer than any push service issues", () => {
    const long = `https://push.example.com/${"a".repeat(2048)}`;
    expect(parsePushEndpoint({ ...subscription, endpoint: long })).toBeNull();
  });

  it("refuses keys outside the base64url alphabet, or missing", () => {
    expect(
      parsePushEndpoint({ ...subscription, keys: { p256dh: "has spaces", auth: "a" } }),
    ).toBeNull();
    expect(parsePushEndpoint({ ...subscription, keys: { p256dh: "", auth: "a" } })).toBeNull();
    expect(parsePushEndpoint({ ...subscription, keys: { auth: "a" } })).toBeNull();
    expect(parsePushEndpoint({ endpoint: subscription.endpoint })).toBeNull();
  });

  it("refuses a body that is not an object at all", () => {
    expect(parsePushEndpoint(null)).toBeNull();
    expect(parsePushEndpoint("subscribe me")).toBeNull();
  });
});

describe("parseEndpointUrl", () => {
  it("takes the endpoint a browser named", () => {
    expect(parseEndpointUrl({ endpoint: subscription.endpoint })).toBe(subscription.endpoint);
  });

  it("refuses anything that is not an https endpoint", () => {
    expect(parseEndpointUrl({ endpoint: "ftp://push.example.com/x" })).toBeNull();
    expect(parseEndpointUrl({})).toBeNull();
    expect(parseEndpointUrl(undefined)).toBeNull();
  });
});

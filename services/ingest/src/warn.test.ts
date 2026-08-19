import { describe, expect, it } from "vitest";
import type { MeterEventDraft } from "./record.js";
import {
  opensActiveLeak,
  type LeakWarning,
  type PushEndpoint,
  type PushResult,
  warnAboutLeaks,
} from "./warn.js";

function endpoint(id: string): PushEndpoint {
  return { id, endpoint: `https://push.example.com/${id}`, p256dh: "key", auth: "secret" };
}

function fakeDeps(endpoints: PushEndpoint[], results: Record<string, PushResult> = {}) {
  const pushed: { id: string; warning: LeakWarning }[] = [];
  const forgotten: string[] = [];
  let live = endpoints;

  return {
    pushed,
    forgotten,
    store: {
      liveEndpoints: async () => live,
      forget: async (id: string) => {
        forgotten.push(id);
        live = live.filter((held) => held.id !== id);
      },
    },
    pusher: {
      send: async (target: PushEndpoint, warning: LeakWarning) => {
        pushed.push({ id: target.id, warning });
        return results[target.id] ?? "sent";
      },
    },
  };
}

const leakStarted: MeterEventDraft = { flag: "activeLeak", from: 0, to: 1 };

describe("opensActiveLeak", () => {
  it("is a leak starting", () => {
    expect(opensActiveLeak(leakStarted)).toBe(true);
    expect(opensActiveLeak({ flag: "activeLeak", from: 0, to: 2 })).toBe(true);
  });

  it("is not a leak clearing, changing kind, or another flag moving", () => {
    expect(opensActiveLeak({ flag: "activeLeak", from: 2, to: 0 })).toBe(false);
    expect(opensActiveLeak({ flag: "activeLeak", from: 1, to: 2 })).toBe(false);
    expect(opensActiveLeak({ flag: "backflow", from: 0, to: 1 })).toBe(false);
    expect(opensActiveLeak({ flag: "noUse", from: 0, to: 1 })).toBe(false);
  });
});

describe("warnAboutLeaks", () => {
  it("warns every live endpoint once, deep-linking to the Meter", async () => {
    const deps = fakeDeps([endpoint("a"), endpoint("b")]);

    await warnAboutLeaks(deps, 42n, [leakStarted]);

    expect(deps.pushed.map(({ id }) => id)).toEqual(["a", "b"]);
    expect(deps.pushed[0]?.warning).toEqual({
      title: "Meter 42 is reporting a leak",
      body: "Water has run through it for much of the day, in bursts.",
      url: "/meter/42",
    });
  });

  it("says a continuous leak never stopped", async () => {
    const deps = fakeDeps([endpoint("a")]);

    await warnAboutLeaks(deps, 42n, [{ flag: "activeLeak", from: 0, to: 2 }]);

    expect(deps.pushed[0]?.warning.body).toBe(
      "Water has run through it without a break for a day.",
    );
  });

  it("pushes nothing for backflow, no-use, or a leak clearing", async () => {
    const deps = fakeDeps([endpoint("a")]);

    await warnAboutLeaks(deps, 42n, [
      { flag: "backflow", from: 0, to: 1 },
      { flag: "noUse", from: 0, to: 1 },
      { flag: "activeLeak", from: 1, to: 0 },
    ]);

    expect(deps.pushed).toEqual([]);
  });

  it("forgets an endpoint the push service has given up on", async () => {
    const deps = fakeDeps([endpoint("a"), endpoint("b")], { a: "gone" });

    await warnAboutLeaks(deps, 42n, [leakStarted]);

    expect(deps.forgotten).toEqual(["a"]);
    expect(deps.pushed.map(({ id }) => id)).toEqual(["a", "b"]);
  });

  it("keeps an endpoint that merely failed, and warns the rest anyway", async () => {
    const deps = fakeDeps([endpoint("a"), endpoint("b")], { a: "failed" });

    await warnAboutLeaks(deps, 42n, [leakStarted]);

    expect(deps.forgotten).toEqual([]);
    expect(deps.pushed.map(({ id }) => id)).toEqual(["a", "b"]);
  });

  it("asks for no endpoints at all when nothing opened a leak", async () => {
    const deps = fakeDeps([endpoint("a")]);

    await warnAboutLeaks(deps, 42n, []);

    expect(deps.pushed).toEqual([]);
  });
});

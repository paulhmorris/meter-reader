import { describe, expect, it } from "vitest";
import { describeEvent } from "./events.js";

describe("describeEvent", () => {
  it("says when a leak started, and whether it runs non-stop", () => {
    expect(describeEvent({ flag: "activeLeak", from: 0, to: 1 })).toBe(
      "Leak started (intermittent)",
    );
    expect(describeEvent({ flag: "activeLeak", from: 0, to: 2 })).toBe("Leak started (continuous)");
  });

  it("says when a leak changed without stopping", () => {
    expect(describeEvent({ flag: "activeLeak", from: 1, to: 2 })).toBe(
      "Leak changed to continuous",
    );
    expect(describeEvent({ flag: "activeLeak", from: 2, to: 1 })).toBe(
      "Leak changed to intermittent",
    );
  });

  it("says when a leak stopped", () => {
    expect(describeEvent({ flag: "activeLeak", from: 2, to: 0 })).toBe("Leak stopped");
  });

  it("names no kind for a flag the meter does not document", () => {
    expect(describeEvent({ flag: "activeLeak", from: 0, to: 3 })).toBe("Leak started");
    expect(describeEvent({ flag: "activeLeak", from: 1, to: 7 })).toBe("Leak changed");
  });

  it("says when water flowed backwards", () => {
    expect(describeEvent({ flag: "backflow", from: 0, to: 1 })).toBe(
      "Water flowed backwards through the meter",
    );
    expect(describeEvent({ flag: "backflow", from: 1, to: 0 })).toBe(
      "Water stopped flowing backwards",
    );
  });

  it("says when the meter saw no water used at all", () => {
    expect(describeEvent({ flag: "noUse", from: 0, to: 1 })).toBe("No water used at all");
    expect(describeEvent({ flag: "noUse", from: 1, to: 0 })).toBe("Water use resumed");
  });
});

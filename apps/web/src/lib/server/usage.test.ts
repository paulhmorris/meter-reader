import { describe, expect, it } from "vitest";
import { usageByPeriod, type UsageStore } from "./usage.js";

const meterId = 1_234_567_890n;

function store(readings: [iso: string, consumption: number][]): UsageStore {
  const stored = readings
    .map(([iso, consumption]) => ({ consumption, receivedAt: new Date(iso) }))
    .sort((a, b) => a.receivedAt.getTime() - b.receivedAt.getTime());

  return {
    async boundaryReadings(_meterId, instants) {
      return instants.map((instant) => ({
        before: stored.filter((reading) => reading.receivedAt < instant).at(-1) ?? null,
        from: stored.find((reading) => reading.receivedAt >= instant) ?? null,
      }));
    },
  };
}

/** Quarter-hourly Readings through an evening, in Chicago's summer offset of UTC-5. */
const evening = store([
  ["2026-06-15T22:45:00Z", 1000],
  ["2026-06-15T23:00:00Z", 1002.5],
  ["2026-06-15T23:15:00Z", 1002.5],
  ["2026-06-15T23:30:00Z", 1010],
  ["2026-06-15T23:45:00Z", 1010],
  ["2026-06-16T00:00:00Z", 1017.5],
]);

describe("usageByPeriod", () => {
  it("takes the last Reading in a period minus the last Reading before it starts", async () => {
    const [hour] = await usageByPeriod(
      { store: evening },
      {
        meterId,
        granularity: "hour",
        from: new Date("2026-06-15T23:00:00Z"),
        to: new Date("2026-06-15T23:59:00Z"),
      },
    );

    expect(hour.gallons).toBe(10);
    expect(hour.partial).toBe(false);
  });

  it("never interpolates across a period whose Readings are missing", async () => {
    const [before, gap, after] = await usageByPeriod(
      {
        store: store([
          ["2026-06-15T20:45:00Z", 1000],
          ["2026-06-15T23:45:00Z", 1060],
        ]),
      },
      {
        meterId,
        granularity: "hour",
        from: new Date("2026-06-15T21:00:00Z"),
        to: new Date("2026-06-15T23:30:00Z"),
      },
    );

    expect(before).toMatchObject({ gallons: 0, partial: true });
    expect(gap).toMatchObject({ gallons: 0, partial: true });
    expect(after).toMatchObject({ gallons: 60, partial: true });
  });

  it("still trusts an idle Meter whose Heartbeats land a little over 15 minutes apart", async () => {
    const idle = store([
      ["2026-06-15T22:44:10Z", 1000],
      ["2026-06-15T22:59:20Z", 1000],
      ["2026-06-15T23:14:30Z", 1000],
      ["2026-06-15T23:29:40Z", 1000],
      ["2026-06-15T23:44:50Z", 1000],
      ["2026-06-16T00:00:00Z", 1000],
    ]);
    const [hour] = await usageByPeriod(
      { store: idle },
      {
        meterId,
        granularity: "hour",
        from: new Date("2026-06-15T23:00:00Z"),
        to: new Date("2026-06-16T00:30:00Z"),
      },
    );

    expect(hour).toMatchObject({ gallons: 0, partial: false });
  });

  it("trusts a boundary a long silence straddles when no water was used across it", async () => {
    const [hour] = await usageByPeriod(
      {
        store: store([
          ["2026-06-15T22:30:00Z", 1000],
          ["2026-06-15T23:25:00Z", 1000],
          ["2026-06-15T23:55:00Z", 1000],
          ["2026-06-16T00:05:00Z", 1000],
        ]),
      },
      {
        meterId,
        granularity: "hour",
        from: new Date("2026-06-15T23:00:00Z"),
        to: new Date("2026-06-16T00:30:00Z"),
      },
    );

    expect(hour).toMatchObject({ gallons: 0, partial: false });
  });

  it("keeps a boundary Partial when water moved across the silence straddling it", async () => {
    const [hour] = await usageByPeriod(
      {
        store: store([
          ["2026-06-15T22:30:00Z", 1000],
          ["2026-06-15T23:25:00Z", 1060],
          ["2026-06-15T23:55:00Z", 1060],
          ["2026-06-16T00:05:00Z", 1060],
        ]),
      },
      {
        meterId,
        granularity: "hour",
        from: new Date("2026-06-15T23:00:00Z"),
        to: new Date("2026-06-16T00:30:00Z"),
      },
    );

    expect(hour).toMatchObject({ gallons: 60, partial: true });
  });

  it("marks a period Partial when the Reading opening it is too old to vouch for", async () => {
    const [hour] = await usageByPeriod(
      {
        store: store([
          ["2026-06-15T22:00:00Z", 1000],
          ["2026-06-15T23:30:00Z", 1020],
          ["2026-06-15T23:55:00Z", 1025],
        ]),
      },
      {
        meterId,
        granularity: "hour",
        from: new Date("2026-06-15T23:00:00Z"),
        to: new Date("2026-06-16T00:30:00Z"),
      },
    );

    expect(hour).toMatchObject({ gallons: 25, partial: true });
  });

  it("marks a period Partial when the Reading closing it is too old to vouch for", async () => {
    const [hour] = await usageByPeriod(
      {
        store: store([
          ["2026-06-15T22:50:00Z", 1000],
          ["2026-06-15T23:05:00Z", 1020],
        ]),
      },
      {
        meterId,
        granularity: "hour",
        from: new Date("2026-06-15T23:00:00Z"),
        to: new Date("2026-06-16T00:30:00Z"),
      },
    );

    expect(hour).toMatchObject({ gallons: 20, partial: true });
  });

  it("reads a period whose Readings are all identical as zero Usage", async () => {
    const flat = store([
      ["2026-06-15T22:45:00Z", 1000],
      ["2026-06-15T23:00:00Z", 1000],
      ["2026-06-15T23:15:00Z", 1000],
      ["2026-06-15T23:30:00Z", 1000],
      ["2026-06-15T23:45:00Z", 1000],
      ["2026-06-16T00:00:00Z", 1000],
    ]);
    const [hour] = await usageByPeriod(
      { store: flat },
      {
        meterId,
        granularity: "hour",
        from: new Date("2026-06-15T23:00:00Z"),
        to: new Date("2026-06-15T23:59:00Z"),
      },
    );

    expect(hour).toMatchObject({ gallons: 0, partial: false });
  });

  it("reads a period the Meter was silent through as zero Usage, not as missing", async () => {
    const [silent] = await usageByPeriod(
      { store: evening },
      {
        meterId,
        granularity: "hour",
        from: new Date("2026-06-16T01:15:00Z"),
        to: new Date("2026-06-16T01:45:00Z"),
      },
    );

    expect(silent).toMatchObject({ gallons: 0, partial: true });
  });

  it("says whether a period was heard in at all, so silence is not averaged as zero", async () => {
    const hours = await usageByPeriod(
      { store: evening },
      {
        meterId,
        granularity: "hour",
        from: new Date("2026-06-15T23:00:00Z"),
        to: new Date("2026-06-16T01:30:00Z"),
      },
    );

    expect(hours.map((hour) => hour.heard)).toEqual([true, true, false]);
  });

  it("marks a period the Meter was not yet heard from as Partial", async () => {
    const [first] = await usageByPeriod(
      { store: evening },
      {
        meterId,
        granularity: "hour",
        from: new Date("2026-06-15T22:00:00Z"),
        to: new Date("2026-06-15T22:30:00Z"),
      },
    );

    expect(first).toMatchObject({ gallons: 0, partial: true });
  });

  it("counts from the first Reading ever heard, rather than reading the day as no water", async () => {
    const [day] = await usageByPeriod(
      { store: evening },
      {
        meterId,
        granularity: "day",
        from: new Date("2026-06-15T22:00:00Z"),
        to: new Date("2026-06-16T00:00:00Z"),
      },
    );

    expect(day).toMatchObject({ gallons: 17.5, partial: true });
  });

  it("buckets a spring-forward day into 23 hourly periods", async () => {
    const hours = await usageByPeriod(
      { store: evening },
      {
        meterId,
        granularity: "hour",
        from: new Date("2026-03-08T06:00:00Z"),
        to: new Date("2026-03-09T04:59:00Z"),
      },
    );

    expect(hours).toHaveLength(23);
  });

  it("buckets days in Chicago, so a fall-back day holds 25 hours of Usage", async () => {
    const midnight = store([
      ["2026-11-01T04:59:00Z", 500],
      ["2026-11-02T05:59:00Z", 590],
    ]);
    const [day] = await usageByPeriod(
      { store: midnight },
      {
        meterId,
        granularity: "day",
        from: new Date("2026-11-01T12:00:00Z"),
        to: new Date("2026-11-01T12:00:00Z"),
      },
    );

    expect(day.start.toISOString()).toBe("2026-11-01T05:00:00.000Z");
    expect(day.end.toISOString()).toBe("2026-11-02T06:00:00.000Z");
    expect(day.gallons).toBe(90);
  });

  it("still trusts a daily boundary once pruning has thinned Readings to one an hour", async () => {
    const pruned = store([
      ["2026-06-15T04:15:00Z", 1000],
      ["2026-06-16T04:15:00Z", 1080],
    ]);
    const [day] = await usageByPeriod(
      { store: pruned },
      {
        meterId,
        granularity: "day",
        from: new Date("2026-06-15T12:00:00Z"),
        to: new Date("2026-06-16T12:00:00Z"),
      },
    );

    expect(day).toMatchObject({ gallons: 80, partial: false });
  });

  it("still trusts a weekly boundary once pruning has thinned Readings to one a day", async () => {
    const pruned = store([
      ["2026-08-17T04:45:00Z", 1000],
      ["2026-08-24T04:45:00Z", 1400],
    ]);
    const [week] = await usageByPeriod(
      { store: pruned },
      {
        meterId,
        granularity: "week",
        from: new Date("2026-08-19T12:00:00Z"),
        to: new Date("2026-08-26T12:00:00Z"),
      },
    );

    expect(week.start.toISOString()).toBe("2026-08-17T05:00:00.000Z");
    expect(week).toMatchObject({ gallons: 400, partial: false });
  });

  it("still trusts a monthly boundary once pruning has thinned Readings to one a day", async () => {
    const pruned = store([
      ["2026-07-01T04:50:00Z", 1000],
      ["2026-08-01T04:50:00Z", 2600],
    ]);
    const [month] = await usageByPeriod(
      { store: pruned },
      {
        meterId,
        granularity: "month",
        from: new Date("2026-07-15T12:00:00Z"),
        to: new Date("2026-08-15T12:00:00Z"),
      },
    );

    expect(month).toMatchObject({ gallons: 1600, partial: false });
  });

  it("marks a month Partial once only one Reading a week survives around its boundaries", async () => {
    const weekly = store([
      ["2025-06-29T04:50:00Z", 1000],
      ["2025-07-06T04:50:00Z", 1400],
      ["2025-08-03T04:50:00Z", 3000],
    ]);
    const [month] = await usageByPeriod(
      { store: weekly },
      {
        meterId,
        granularity: "month",
        from: new Date("2025-07-15T12:00:00Z"),
        to: new Date("2026-08-19T12:00:00Z"),
      },
    );

    expect(month).toMatchObject({ gallons: 400, partial: true });
  });

  it("asks the store for each boundary once", async () => {
    const instants: Date[][] = [];
    const counting: UsageStore = {
      async boundaryReadings(meterId, boundaries) {
        instants.push(boundaries);
        return evening.boundaryReadings(meterId, boundaries);
      },
    };

    const hours = await usageByPeriod(
      { store: counting },
      {
        meterId,
        granularity: "hour",
        from: new Date("2026-06-15T22:00:00Z"),
        to: new Date("2026-06-16T00:00:00Z"),
      },
    );

    expect(instants).toHaveLength(1);
    expect(instants[0]).toHaveLength(hours.length + 1);
  });
});

describe("the period in progress", () => {
  it("is not Partial merely because it has not finished", async () => {
    const [current] = await usageByPeriod(
      { store: evening },
      {
        meterId,
        granularity: "hour",
        from: new Date("2026-06-16T00:05:00Z"),
        to: new Date("2026-06-16T00:05:00Z"),
      },
    );

    expect(current).toMatchObject({ gallons: 7.5, partial: false });
  });
});

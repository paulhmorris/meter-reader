import { FINER, WINDOW, type Granularity } from "../granularity.js";
import { daysBefore, monthsBefore, next, startOf, type Period } from "./periods.js";

export const PRESETS = ["today", "7d", "30d", "12mo"] as const;

export type Preset = (typeof PRESETS)[number];

/** One view of the chart: periods of `granularity` filling the window that starts at `at`. */
export interface View {
  granularity: Granularity;
  at: Date;
}

export interface ChartRange {
  preset: Preset;
  granularity: Granularity;
  from: Date;
  to: Date;
  /** Whether a drill-down is in force, rather than the preset's own stretch. */
  drilled: boolean;
  /** The views a drill-down came down through, coarsest first. Empty for a plain preset. */
  trail: View[];
  /** What tapping a bar opens, or null when there is nothing finer to show. */
  drillTo: Granularity | null;
}

const PRESET_RANGE: Record<Preset, (now: Date) => { granularity: Granularity; from: Date }> = {
  today: (now) => ({ granularity: "hour", from: daysBefore(now, 0) }),
  "7d": (now) => ({ granularity: "day", from: daysBefore(now, 6) }),
  "30d": (now) => ({ granularity: "day", from: daysBefore(now, 29) }),
  "12mo": (now) => ({ granularity: "month", from: monthsBefore(now, 11) }),
};

function preset(value: string | null): Preset {
  return PRESETS.find((known) => known === value) ?? "today";
}

function granularityOf(value: string | null): Granularity | null {
  return value !== null && Object.hasOwn(WINDOW, value) ? (value as Granularity) : null;
}

function drilledWindow(granularity: Granularity, at: Date): Period | null {
  const outer = WINDOW[granularity];
  if (outer === null) return null;

  const start = startOf(outer, at);
  return { start, end: next(outer, start) };
}

/** The views above this one, coarsest first: the week a drilled day sits in, then its month. */
function trailTo(granularity: Granularity, at: Date): View[] {
  const trail: View[] = [];

  for (let view = WINDOW[granularity]; view !== null; view = WINDOW[view]) {
    const outer = WINDOW[view];
    if (outer === null) break;
    trail.unshift({ granularity: view, at: startOf(outer, at) });
  }

  return trail;
}

/**
 * What the chart shows: a preset, or the drill-down named by `g` and `at` on top of it. Anything
 * the query string cannot be read as, and any window that has not begun, falls back to the preset.
 */
export function resolveRange(params: URLSearchParams, now: Date): ChartRange {
  const chosen = preset(params.get("range"));
  const granularity = granularityOf(params.get("g"));
  const at = new Date(params.get("at") ?? "");
  const window =
    granularity !== null && !Number.isNaN(at.getTime()) ? drilledWindow(granularity, at) : null;

  if (granularity === null || window === null || window.start > now) {
    const { granularity: shown, from } = PRESET_RANGE[chosen](now);
    return {
      preset: chosen,
      granularity: shown,
      from,
      to: now,
      drilled: false,
      trail: [],
      drillTo: FINER[shown],
    };
  }

  return {
    preset: chosen,
    granularity,
    from: window.start,
    // A window still running ends at now, so the period in progress is not judged from the future.
    to: new Date(Math.min(window.end.getTime() - 1, now.getTime())),
    drilled: true,
    trail: trailTo(granularity, window.start),
    drillTo: FINER[granularity],
  };
}

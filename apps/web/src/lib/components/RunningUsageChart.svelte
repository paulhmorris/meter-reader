<script lang="ts" module>
  export interface ChartPoint {
    at: Date;
    /** Gallons used since the stretch opened. */
    gallons: number;
    leaking: boolean;
    /** Whether a silence between the point before this one and this one hides Usage. */
    afterSilence: boolean;
  }
</script>

<script lang="ts">
  import { curveStepAfter } from "d3-shape";
  import { LineChart, Spline, Text, Tooltip } from "layerchart";
  import { readingTime, tick } from "$lib/chart-format.js";
  import { scrub, tooltipX } from "$lib/chart-pointer.js";

  let { points, height = "h-56" }: { points: ChartPoint[]; height?: string } = $props();

  const gallons = new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 });

  /** Each point with the gallons its own step accounts for, which is what its height reads as. */
  const plotted = $derived(
    points.map((point, index) => ({
      ...point,
      since:
        index === 0 || point.afterSilence
          ? null
          : Math.round((point.gallons - points[index - 1].gallons) * 10) / 10,
    })),
  );

  /**
   * The line is drawn a run at a time rather than in one stroke, so a silence that hides Usage
   * leaves a gap instead of a segment claiming where the water crossed it (ADR-0002).
   */
  const runs = $derived(
    plotted.reduce<(typeof plotted)[number][][]>((runs, point) => {
      if (point.afterSilence || runs.length === 0) runs.push([]);
      runs[runs.length - 1].push(point);
      return runs;
    }, []),
  );

  const used = $derived(points.length > 0 ? points[points.length - 1].gallons : 0);

  let context = $state<any>();
  /** A finger covers whatever it points at, so a touch pins the tooltip to the top of the chart. */
  let touching = $state(false);
  let tooltipRef = $state<HTMLElement>();
</script>

<!-- The leftmost label sits to the right of its tick rather than centred on it, so a wide one
     cannot reach back over the y axis's own labels. -->
{#snippet xTickLabel({ props, index }: { props: any; index: number })}
  <Text {...props} textAnchor={index === 0 ? "start" : props.textAnchor} />
{/snippet}

<figure class="m-0">
  {#if used === 0}
    <p class="rounded-lg border border-dashed border-border p-6 text-sm text-muted-foreground">
      No water is recorded for any of this stretch. Either none was used, or the meter went unheard
      for all of it.
    </p>
  {:else}
    <!-- The sr-only table below carries the same Readings; this is the pointer's copy. -->
    <div
      class={height}
      role="presentation"
      onpointerdown={(event) => (touching = event.pointerType === "touch")}
      onpointermove={(event) => (touching = event.pointerType === "touch")}
      {@attach scrub}
    >
      <LineChart
        bind:context
        data={plotted}
        x="at"
        y="gallons"
        grid={{ y: true, x: false }}
        rule={false}
        props={{
          xAxis: {
            format: (value: Date) => tick("hour", value),
            tickLength: 0,
            ticks: 6,
            tickLabel: xTickLabel,
          },
          yAxis: { format: (value: number) => gallons.format(value), tickLength: 0, ticks: 4 },
          grid: { class: "stroke-chart-grid" },
          highlight: { points: { class: "fill-chart-usage stroke-background" } },
        }}
      >
        {#snippet marks()}
          {#each runs as run, index (index)}
            <!-- Consumption is only ever read, never interpolated, so the total holds flat until
                 the next Reading rather than sloping towards it. -->
            <Spline data={run} curve={curveStepAfter} strokeWidth={2} class="stroke-chart-usage" />
          {/each}
        {/snippet}

        {#snippet tooltip({ context }: { context: any })}
          <Tooltip.Root
            {context}
            bind:rootRef={tooltipRef}
            x={tooltipX(context, tooltipRef)}
            y={touching ? 0 : "pointer"}
            anchor="top-left"
            class="border border-border bg-popover text-popover-foreground"
          >
            {#snippet children({ data }: { data: (typeof plotted)[number] })}
              <div class="px-3 py-2">
                <p class="text-xs text-muted-foreground">{readingTime(data.at)}</p>
                <p class="text-base font-semibold">
                  {gallons.format(data.gallons)}
                  <span class="text-xs font-normal text-muted-foreground">gal today</span>
                </p>
                {#if data.since !== null}
                  <p class="text-xs text-muted-foreground">
                    + {gallons.format(data.since)}
                  </p>
                {/if}
                {#if data.leaking}
                  <p class="mt-1 text-xs text-danger">The meter was reporting a leak</p>
                {/if}
              </div>
            {/snippet}
          </Tooltip.Root>
        {/snippet}
      </LineChart>
    </div>
  {/if}

  <div class="relative overflow-hidden">
    <table class="sr-only">
      <caption>Water used so far, at each reading</caption>
      <thead><tr><th scope="col">Reading</th><th scope="col">Gallons so far</th></tr></thead>
      <tbody>
        {#each points as point, index (index)}
          <tr>
            <th scope="row">{readingTime(point.at)}</th>
            <td>
              {gallons.format(point.gallons)}
              {point.leaking ? " (the meter was reporting a leak)" : ""}
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>

  <!-- Held open at one line whether or not it has anything to say, so switching between the line
       and the bars does not move whatever sits under the chart. -->
  <figcaption class="mt-3 min-h-4 text-xs text-muted-foreground">
    {#if runs.length > 1}
      The line breaks where the meter went unheard while water was being used
    {/if}
  </figcaption>
</figure>

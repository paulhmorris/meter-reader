<script lang="ts" module>
  export interface ChartPeriod {
    start: Date;
    end: Date;
    gallons: number;
    partial: boolean;
    leaking: boolean;
  }
</script>

<script lang="ts">
  import { BarChart, Bars, Text, Tooltip } from "layerchart";
  import { cubicOut } from "svelte/easing";
  import { goto } from "$app/navigation";
  import { periodName, tick } from "$lib/chart-format.js";
  import type { Granularity } from "$lib/granularity.js";

  let {
    periods,
    granularity,
    drillHref = null,
    height = "h-56",
  }: {
    periods: ChartPeriod[];
    granularity: Granularity;
    /** Where tapping a period goes, or null when there is nothing finer to show. */
    drillHref?: ((period: ChartPeriod) => string) | null;
    height?: string;
  } = $props();

  const gallons = new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 });

  const plain = $derived(periods.filter((period) => !period.leaking));
  const leaking = $derived(periods.filter((period) => period.leaking));
  const partial = $derived(periods.filter((period) => period.partial));
  const anyPartial = $derived(partial.some((period) => period.gallons > 0));
  const anyLeaking = $derived(leaking.some((period) => period.gallons > 0));
  const anyUsage = $derived(periods.some((period) => period.gallons > 0));

  const describe = (period: ChartPeriod) => periodName(granularity, period);

  let context = $state<any>();
  /** Where a press started, so a drag that ends on a bar reads as a drag and not as a tap. */
  let pressedAt: { x: number; y: number } | null = null;

  const still =
    typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /** Naming only the value axis leaves x and width unanimated, so no bar ever travels sideways. */
  const grow = { type: "tween", duration: 220, easing: cubicOut } as const;

  /**
   * Bars land in the same bands whichever subset they come from, so tone can be a layer per tone.
   * Keying by the period itself rather than by index retires the old window's bars outright, so a
   * new window grows up from the axis instead of the old heights crawling to the new ones. The end
   * is in the key as well as the start, so a day and the hour it opens with never share a bar.
   */
  const layer = {
    radius: 3,
    rounded: "top" as const,
    motion: still ? ("none" as const) : ({ y: grow, height: grow } as const),
    initialHeight: 0,
    tooltip: true,
    key: (period: ChartPeriod) => `${period.start.getTime()}-${period.end.getTime()}`,
  };

  /**
   * A tap opens the period the tooltip is on, which is the whole band rather than the bar itself:
   * a day of little water is a target a few pixels wide.
   */
  function onpointerup(event: PointerEvent) {
    const from = pressedAt;
    pressedAt = null;

    const dragged = from && Math.hypot(event.clientX - from.x, event.clientY - from.y) > 8;
    const period = context?.tooltip?.data as ChartPeriod | undefined;
    if (!dragged && drillHref && period)
      goto(drillHref(period), { replaceState: true, noScroll: true });
  }
</script>

<!-- The leftmost label sits to the right of its tick rather than centred on it, so a wide one
     cannot reach back over the y axis's own labels. -->
{#snippet xTickLabel({ props, index }: { props: any; index: number })}
  <Text {...props} textAnchor={index === 0 ? "start" : props.textAnchor} />
{/snippet}

<figure class="m-0">
  {#if !anyUsage}
    <p class="rounded-lg border border-dashed border-border p-6 text-sm text-muted-foreground">
      No water is recorded for any of this stretch — either none was used, or the meter went unheard
      for all of it.
    </p>
  {:else}
    <!-- The sr-only table below carries the same periods and links; this is the pointer's copy. -->
    <div
      class={height}
      role="presentation"
      onpointerdown={(event) => (pressedAt = { x: event.clientX, y: event.clientY })}
      {onpointerup}
    >
      <BarChart
        bind:context
        data={periods}
        x="start"
        y="gallons"
        bandPadding={0.25}
        grid={{ y: true, x: false }}
        rule={false}
        props={{
          xAxis: {
            format: (value: Date) => tick(granularity, value),
            tickLength: 0,
            ticks: 6,
            tickLabel: xTickLabel,
          },
          yAxis: { format: (value: number) => gallons.format(value), tickLength: 0, ticks: 4 },
          grid: { class: "stroke-chart-grid" },
          highlight: { area: { class: "fill-foreground/5" } },
        }}
      >
        {#snippet marks()}
          <defs>
            <pattern
              id="usage-partial"
              width="5"
              height="5"
              patternUnits="userSpaceOnUse"
              patternTransform="rotate(45)"
            >
              <rect width="5" height="5" class="fill-background" />
              <line y2="5" class="stroke-foreground/45" stroke-width="2.5" />
            </pattern>
          </defs>

          <Bars data={plain} {...layer} class="fill-chart-usage" />
          <Bars data={leaking} {...layer} class="fill-chart-leak" />
          <!-- Drawn over whichever tone is beneath, so a Partial period reads as partial either way. -->
          <Bars data={partial} {...layer} fill="url(#usage-partial)" fillOpacity={0.55} />
        {/snippet}

        {#snippet tooltip({ context }: { context: any })}
          <Tooltip.Root {context} class="border border-border bg-popover text-popover-foreground">
            {#snippet children({ data }: { data: ChartPeriod })}
              <div class="px-3 py-2">
                <p class="text-xs text-muted-foreground">{describe(data)}</p>
                <p class="text-base font-semibold tabular-nums">
                  {gallons.format(data.gallons)}
                  <span class="text-xs font-normal text-muted-foreground">gal</span>
                </p>
                {#if data.leaking}
                  <p class="mt-1 text-xs text-danger">The meter reported a leak during this time</p>
                {/if}
                {#if data.partial}
                  <p class="mt-1 text-xs text-muted-foreground">Incomplete data</p>
                {/if}
              </div>
            {/snippet}
          </Tooltip.Root>
        {/snippet}
      </BarChart>
    </div>
  {/if}

  <div class="relative overflow-hidden">
    <table class="sr-only">
      <caption>Water used per period</caption>
      <thead><tr><th scope="col">Period</th><th scope="col">Gallons</th></tr></thead>
      <tbody>
        {#each periods as period (period.start.getTime())}
          <tr>
            <th scope="row">
              {#if drillHref}
                <a href={drillHref(period)}>{describe(period)}</a>
              {:else}
                {describe(period)}
              {/if}
            </th>
            <td>
              {gallons.format(period.gallons)}
              {period.partial ? " (partial — the meter went unheard from around then)" : ""}
              {period.leaking ? " (the meter was reporting a leak)" : ""}
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>

  <figcaption class="mt-3 space-y-1.5 text-xs text-muted-foreground">
    {#if anyLeaking}
      <p class="flex items-start gap-2">
        <span class="mt-0.5 size-3 shrink-0 rounded-sm bg-chart-leak" aria-hidden="true"></span>
        The meter was reporting a leak during these.
      </p>
    {/if}
    {#if anyPartial}
      <p class="flex items-start gap-2">
        <span
          class="mt-0.5 size-3 shrink-0 rounded-sm border border-border bg-[repeating-linear-gradient(45deg,var(--muted-foreground)_0_1.5px,var(--background)_1.5px_4px)]"
          aria-hidden="true"
        ></span>
        Incomplete data
      </p>
    {/if}
  </figcaption>
</figure>

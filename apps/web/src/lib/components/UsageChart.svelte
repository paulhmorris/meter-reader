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
  import { BarChart, Bars, Tooltip } from "layerchart";
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

  let context = $state<any>();
  /** The period the pointer last sat over, kept because a tap clears the tooltip before it lands. */
  let hovered = $state<ChartPeriod | null>(null);
  /** The stretch a brush has narrowed the chart to. Deliberately not in the URL: it is a gesture. */
  let brushed = $state<{ from: number; to: number } | null>(null);

  const shown = $derived.by(() => {
    const stretch = brushed;
    if (stretch === null) return periods;
    return periods.filter(
      (period) => period.start.getTime() >= stretch.from && period.start.getTime() <= stretch.to,
    );
  });

  const plain = $derived(shown.filter((period) => !period.leaking));
  const leaking = $derived(shown.filter((period) => period.leaking));
  const partial = $derived(shown.filter((period) => period.partial));
  const anyPartial = $derived(partial.some((period) => period.gallons > 0));
  const anyLeaking = $derived(leaking.some((period) => period.gallons > 0));
  const anyUsage = $derived(shown.some((period) => period.gallons > 0));

  const describe = (period: ChartPeriod) => periodName(granularity, period);

  const still =
    typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /** Bars land in the same bands whichever subset they come from, so tone can be a layer per tone. */
  const layer = {
    radius: 3,
    rounded: "top",
    motion: still ? "none" : "tween",
    initialHeight: 0,
    tooltip: true,
  } as const;

  $effect(() => {
    const under = context?.tooltip?.data ?? null;
    if (under) hovered = under;
  });

  /**
   * A drag narrows the chart to what it covered; a tap opens whatever it landed on. The selection
   * itself is thrown away: narrowing the data is what narrows the chart, so the two cannot disagree.
   */
  function onBrushEnd({
    brush,
  }: {
    brush: { active?: boolean; x: (Date | number | string | null)[]; reset: () => void };
  }) {
    const [from, to] = brush.x;

    if (brush.active && from instanceof Date && to instanceof Date) {
      brushed = { from: Math.min(+from, +to), to: Math.max(+from, +to) };
      brush.reset();
      return;
    }

    if (drillHref && hovered) goto(drillHref(hovered));
    else brushed = null;
  }
</script>

<figure class="m-0">
  {#if !anyUsage}
    <p class="rounded-lg border border-dashed border-border p-6 text-sm text-muted-foreground">
      No water is recorded for any of this stretch — either none was used, or the meter went unheard
      for all of it.
    </p>
  {:else}
    <div class={height}>
      <BarChart
        bind:context
        data={shown}
        x="start"
        y="gallons"
        bandPadding={0.25}
        grid={{ y: true, x: false }}
        rule={false}
        brush={{ axis: "x", zoomOnBrush: false, onBrushEnd }}
        props={{
          xAxis: {
            format: (value: Date) => tick(granularity, value),
            tickLength: 0,
            ticks: 6,
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
                  <p class="mt-1 max-w-52 text-xs text-muted-foreground">
                    Readings are missing around then, so this is too low or too high
                  </p>
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
        {#each shown as period (period.start.getTime())}
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
    <p>
      {#if brushed}
        Showing {describe(shown[0])} to {describe(shown[shown.length - 1])}.
        <button class="underline underline-offset-2" onclick={() => (brushed = null)}>
          Show all of it
        </button>
      {:else}
        Drag across the chart to look closer{drillHref ? ", or tap a bar to open it" : ""}.
      {/if}
    </p>
    {#if anyLeaking}
      <p class="flex items-start gap-2">
        <span class="mt-0.5 size-3 shrink-0 rounded-sm bg-chart-leak" aria-hidden="true"></span>
        The meter was reporting a leak during these.
      </p>
    {/if}
    {#if anyPartial}
      <p class="flex items-start gap-2">
        <span
          class="mt-0.5 size-3 shrink-0 rounded-sm border border-border bg-background bg-[repeating-linear-gradient(45deg,var(--foreground)_0_2px,transparent_2px_5px)] opacity-70"
          aria-hidden="true"
        ></span>
        The meter went unheard from around these times, so the water shown is too low or too high. It
        is what the readings we do have add up to — we would rather show that than guess.
      </p>
    {/if}
  </figcaption>
</figure>

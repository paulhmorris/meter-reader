<script lang="ts">
  import { page } from "$app/state";
  import { windowName } from "$lib/chart-format.js";
  import { rememberChartKind, type ChartKind } from "$lib/chart-kind.js";
  import ChartKindToggle from "$lib/components/ChartKindToggle.svelte";
  import EventTimeline from "$lib/components/EventTimeline.svelte";
  import LeakBanner from "$lib/components/LeakBanner.svelte";
  import MeterHealthBadge from "$lib/components/MeterHealthBadge.svelte";
  import StatCard from "$lib/components/StatCard.svelte";
  import { Badge } from "$lib/components/ui/badge/index.js";
  import { buttonVariants } from "$lib/components/ui/button/index.js";
  import RunningUsageChart from "$lib/components/RunningUsageChart.svelte";
  import UsageChart, { type ChartPeriod } from "$lib/components/UsageChart.svelte";
  import type { Granularity } from "$lib/granularity.js";
  import LeakWarnings from "$lib/LeakWarnings.svelte";
  import RotateCcw from "@lucide/svelte/icons/rotate-ccw";
  import type { Preset, View } from "$lib/server/ranges.js";
  import type { PageData } from "./$types.js";

  let { data }: { data: PageData } = $props();

  const PRESET_NAMES: Record<Preset, string> = {
    today: "Today",
    "7d": "7 days",
    "30d": "30 days",
    "12mo": "1 year",
  };

  /** What the heading calls a preset, where there is room for more than a button holds. */
  const PRESET_STRETCHES: Record<Preset, string> = {
    today: "Today",
    "7d": "The last 7 days",
    "30d": "The last 30 days",
    "12mo": "The last year",
  };

  const BY: Record<Granularity, string> = {
    hour: "by the hour",
    day: "by day",
    week: "by week",
    month: "by month",
  };

  const PER: Record<Granularity, string> = {
    hour: "hour",
    day: "day",
    week: "week",
    month: "month",
  };

  const isFresh = $derived(data.health === "fresh");
  const range = $derived(data.range);

  // svelte-ignore state_referenced_locally
  let kind = $state<ChartKind>(data.chartKind);
  $effect(() => rememberChartKind(kind));

  /** Whether the running line is on screen, rather than merely offered. */
  const running = $derived(data.trace !== null && kind === "line");

  /** The stretch the chart is on: the preset itself, or the window a drill-down opened. */
  const stretch = $derived(
    range.drilled ? windowName(range.granularity, range.from) : PRESET_STRETCHES[range.preset],
  );

  function chartHref(preset: Preset, view?: View): string {
    const params = new URLSearchParams();
    if (preset !== "today") params.set("range", preset);
    if (view) {
      params.set("g", view.granularity);
      params.set("at", view.at.toISOString());
    }
    return params.size === 0 ? page.url.pathname : `${page.url.pathname}?${params}`;
  }

  const gallons = new Intl.NumberFormat(undefined, {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });

  /** The one figure the page leads with, which is the stretch the chart is on totted up. */
  const total = $derived(data.chart.reduce((sum, period) => sum + period.gallons, 0));

  /**
   * What an average is taken over: every period the Meter was heard in, Partial or not, since its
   * Usage is water that was really used. Only silence and the period still running are left out,
   * the one having no figure to average and the other being a fraction of one.
   */
  const counted = $derived(data.chart.filter((period) => period.heard && period.end <= range.to));

  const average = $derived.by(() => {
    if (counted.length === 0) return null;
    const mean = counted.reduce((sum, period) => sum + period.gallons, 0) / counted.length;
    return `${gallons.format(mean)} gal per ${PER[range.granularity]} on average`;
  });

  const drillHref = $derived.by(() => {
    const finer = range.drillTo;
    if (finer === null) return null;
    return (period: ChartPeriod) =>
      chartHref(range.preset, { granularity: finer, at: period.start });
  });
</script>

<svelte:head><title>Water usage · Meter {data.meterId}</title></svelte:head>

<div class="space-y-6">
  <header class="flex flex-wrap items-center justify-between gap-3">
    <h1 class="text-lg font-semibold tracking-tight">Meter {data.meterId}</h1>
    <div class="flex items-center gap-2">
      {#if data.health}
        <MeterHealthBadge health={data.health} lastHeardAt={data.reading?.receivedAt ?? null} />
      {/if}
      {#if data.admin}
        <a
          href="/admin/meter/{data.meterId}"
          class={buttonVariants({ variant: "outline", size: "sm" })}
        >
          Admin view
        </a>
      {/if}
    </div>
  </header>

  {#if data.reading}
    {#if data.reading.activeLeak !== "none"}
      <LeakBanner level={data.reading.activeLeak} fresh={isFresh} />
    {/if}

    {#if data.health === "broken"}
      <p class="border-danger/40 bg-danger/10 rounded-lg border p-4 text-sm leading-relaxed">
        This meter has not been heard from for more than three days.
      </p>
    {:else if data.health === "stale"}
      <p class="border-warning/40 bg-warning/10 rounded-lg border p-4 text-sm leading-relaxed">
        This meter has not been heard from in over a day.
      </p>
    {/if}

    <!-- Chart navigation replaces rather than stacks: Back leaves the page, not the last filter. -->
    <section class="space-y-3" data-sveltekit-replacestate data-sveltekit-noscroll>
      <StatCard
        label={range.drilled ? stretch : PRESET_NAMES[range.preset]}
        gallons={total}
        hint={average}
      />

      <nav aria-label="How much to show" class="flex flex-wrap gap-2">
        {#each Object.entries(PRESET_NAMES) as [preset, name] (preset)}
          {@const chosen = preset === range.preset && !range.drilled}
          <a
            href={chartHref(preset as Preset)}
            aria-current={chosen ? "page" : undefined}
            class="inline-flex min-h-11 flex-1 items-center justify-center rounded-md border px-3 text-sm font-medium transition-colors {chosen
              ? 'border-transparent bg-primary text-primary-foreground'
              : 'border-border hover:bg-accent'}"
          >
            {name}
          </a>
        {/each}
      </nav>

      {#if range.drilled}
        <nav aria-label="Where you are" class="flex flex-wrap items-center gap-1.5 text-xs">
          <a class="text-muted-foreground hover:underline" href={chartHref(range.preset)}>
            {PRESET_NAMES[range.preset]}
          </a>
          {#each range.trail as view (view.granularity)}
            <span aria-hidden="true" class="text-muted-foreground">›</span>
            <a class="text-muted-foreground hover:underline" href={chartHref(range.preset, view)}>
              {windowName(view.granularity, view.at)}
            </a>
          {/each}
          <span aria-hidden="true" class="text-muted-foreground">›</span>
          <span>{stretch}</span>
        </nav>
      {/if}

      <div class="flex items-center justify-between gap-3">
        <h2 class="text-sm font-medium">
          {stretch}, {running ? "reading by reading" : BY[range.granularity]}
        </h2>
        {#if data.trace !== null}
          <ChartKindToggle bind:kind />
        {/if}
        {#if range.drilled}
          <Badge variant="outline" href={chartHref(range.preset)} class="gap-1">
            <RotateCcw class="size-3" aria-hidden="true" />
            Reset
          </Badge>
        {/if}
      </div>

      {#if range.granularity === "week"}
        <p class="text-xs text-muted-foreground">
          Weeks run Monday to Monday, so the first and last reach either side of the month
        </p>
      {/if}

      {#if !isFresh}
        <p class="text-xs text-muted-foreground">Up to when the meter was last heard from</p>
      {/if}

      {#if running && data.trace}
        <RunningUsageChart points={data.trace} />
      {:else}
        <UsageChart periods={data.chart} granularity={range.granularity} {drillHref} />
      {/if}
    </section>

    {#if data.events.length > 0}
      <section class="space-y-3">
        <h2 class="text-sm font-medium">Events</h2>
        <EventTimeline events={data.events} older={data.older} />
      </section>
    {/if}
  {:else}
    <p class="border-warning/40 bg-warning/10 rounded-lg border p-4 text-sm leading-relaxed">
      This meter has not been heard from yet.
    </p>
  {/if}

  {#if data.pushKey}
    <LeakWarnings meterId={data.meterId} publicKey={data.pushKey} />
  {/if}
</div>

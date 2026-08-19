<script lang="ts">
  import { page } from "$app/state";
  import { windowName } from "$lib/chart-format.js";
  import EventTimeline from "$lib/components/EventTimeline.svelte";
  import LeakBanner from "$lib/components/LeakBanner.svelte";
  import MeterHealthBadge from "$lib/components/MeterHealthBadge.svelte";
  import StatCard from "$lib/components/StatCard.svelte";
  import { Badge } from "$lib/components/ui/badge/index.js";
  import UsageChart, { type ChartPeriod } from "$lib/components/UsageChart.svelte";
  import type { Granularity } from "$lib/granularity.js";
  import LeakWarnings from "$lib/LeakWarnings.svelte";
  import RotateCcw from "@lucide/svelte/icons/rotate-ccw";
  import type { Preset, View } from "$lib/server/ranges.js";
  import type { PageData } from "./$types.js";

  let { data }: { data: PageData } = $props();

  const zone = "America/Chicago";
  const gallons = new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 });
  const heardAt = new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: zone,
  });

  const PRESET_NAMES: Record<Preset, string> = {
    today: "Today",
    "7d": "7 days",
    "30d": "30 days",
    "12mo": "12 months",
  };

  /** What the heading calls a preset, where there is room for more than a button holds. */
  const PRESET_STRETCHES: Record<Preset, string> = {
    today: "Today",
    "7d": "The last 7 days",
    "30d": "The last 30 days",
    "12mo": "The last 12 months",
  };

  const BY: Record<Granularity, string> = {
    hour: "by the hour",
    day: "by day",
    week: "by week",
    month: "by month",
  };

  const isFresh = $derived(data.health === "fresh");
  const range = $derived(data.range);

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

  const drillHref = $derived.by(() => {
    const finer = range.drillTo;
    if (finer === null) return null;
    return (period: ChartPeriod) =>
      chartHref(range.preset, { granularity: finer, at: period.start });
  });
</script>

<svelte:head><title>Meter {data.meterId}</title></svelte:head>

<div class="space-y-6">
  <header class="flex items-center justify-between gap-3">
    <h1 class="text-lg font-semibold tracking-tight">Meter {data.meterId}</h1>
    {#if data.health}
      <MeterHealthBadge health={data.health} lastHeardAt={data.reading?.receivedAt ?? null} />
    {/if}
  </header>

  {#if data.reading}
    {#if data.reading.activeLeak !== "none"}
      <LeakBanner level={data.reading.activeLeak} fresh={isFresh} />
    {/if}

    {#if data.health === "broken"}
      <p class="border-danger/40 bg-danger/10 rounded-lg border p-4 text-sm leading-relaxed">
        We have not picked up this meter for more than three days. Our receiver is most likely down,
        so nothing here is current — it is where the meter stood when we last heard it.
      </p>
    {:else if data.health === "stale"}
      <p class="border-warning/40 bg-warning/10 rounded-lg border p-4 text-sm leading-relaxed">
        We have not picked up this meter for over a day. Our receiver may be down, so the numbers
        below are the last we heard rather than what the meter reads now.
      </p>
    {/if}

    <StatCard
      hero={{ label: "Today", gallons: data.today }}
      secondary={{ label: "7-day average", gallons: data.weekAverage, hint: "per day" }}
    />

    <p class="text-xs text-muted-foreground">
      {gallons.format(data.reading.consumption)} gallons since this meter was installed ·
      {isFresh ? "last heard from" : "last known reading, heard"}
      {heardAt.format(data.reading.receivedAt)}{data.reading.leakHistory
        ? ` · days with a leak, as far back as the meter counts: ${data.reading.leakHistory}`
        : ""}
    </p>

    <section class="space-y-3">
      <nav aria-label="How much to show" class="flex flex-wrap gap-1.5">
        {#each Object.entries(PRESET_NAMES) as [preset, name] (preset)}
          {@const chosen = preset === range.preset && !range.drilled}
          <a
            href={chartHref(preset as Preset)}
            aria-current={chosen ? "page" : undefined}
            class="rounded-md border px-2.5 py-1 text-xs font-medium transition-colors {chosen
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
        <h2 class="text-sm font-medium">{stretch}, {BY[range.granularity]}</h2>
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
        <p class="text-xs text-muted-foreground">
          Up to when we last heard from the meter, not to now
        </p>
      {/if}

      <UsageChart periods={data.chart} granularity={range.granularity} {drillHref} />
    </section>

    <section class="space-y-3">
      <h2 class="text-sm font-medium">What the meter has reported</h2>
      <EventTimeline events={data.events} older={data.older} at={heardAt} />
    </section>
  {:else}
    <p class="border-warning/40 bg-warning/10 rounded-lg border p-4 text-sm leading-relaxed">
      We have not picked up this meter at all yet. Until our receiver hears it, there is nothing to
      show.
    </p>
  {/if}

  {#if data.pushKey}
    <LeakWarnings meterId={data.meterId} publicKey={data.pushKey} />
  {/if}
</div>

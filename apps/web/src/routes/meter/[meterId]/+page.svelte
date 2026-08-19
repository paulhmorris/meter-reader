<script lang="ts">
  import EventTimeline from "$lib/components/EventTimeline.svelte";
  import LeakBanner from "$lib/components/LeakBanner.svelte";
  import MeterHealthBadge from "$lib/components/MeterHealthBadge.svelte";
  import StatCard from "$lib/components/StatCard.svelte";
  import UsageChart, { type ChartPeriod } from "$lib/components/UsageChart.svelte";
  import LeakWarnings from "$lib/LeakWarnings.svelte";
  import type { PageData } from "./$types.js";

  let { data }: { data: PageData } = $props();

  const zone = "America/Chicago";
  const gallons = new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 });
  const heardAt = new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: zone,
  });
  const hourLabel = new Intl.DateTimeFormat(undefined, { hour: "numeric", timeZone: zone });
  const dayLabel = new Intl.DateTimeFormat(undefined, {
    month: "numeric",
    day: "numeric",
    timeZone: zone,
  });
  const dayName = new Intl.DateTimeFormat(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
    timeZone: zone,
  });

  const isFresh = $derived(data.health === "fresh");

  // What today's chart adds up to. The day's own bar can read lower, since a day whose opening
  // Reading is missing accounts for none of the water used before the first one we have.
  const today = $derived(data.hourly.reduce((total, hour) => total + hour.gallons, 0));
  const todayPartial = $derived(data.hourly.some((hour) => hour.partial));

  /** The seven whole days behind today — today is still in progress and would drag it down. */
  const weekAverage = $derived.by(() => {
    const week = data.daily.slice(-8, -1);
    if (week.length === 0) return 0;
    return week.reduce((total, day) => total + day.gallons, 0) / week.length;
  });
</script>

<svelte:head><title>Meter {data.meterId}</title></svelte:head>

<div class="space-y-6">
  <header class="flex items-center justify-between gap-3">
    <h1 class="text-lg font-semibold tracking-tight">Meter {data.meterId}</h1>
    {#if data.health}
      <MeterHealthBadge health={data.health} />
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
      hero={{
        label: "Today",
        gallons: today,
        hint: todayPartial
          ? "so far, on the readings we have"
          : isFresh
            ? "so far"
            : "on the last readings we have",
      }}
      secondary={{ label: "7-day average", gallons: weekAverage, hint: "per day" }}
    />

    <p class="text-xs text-muted-foreground">
      {gallons.format(data.reading.consumption)} gallons since this meter was installed ·
      {isFresh ? "last heard from" : "last known reading, heard"}
      {heardAt.format(data.reading.receivedAt)}{data.reading.leakHistory
        ? ` · days with a leak, as far back as the meter counts: ${data.reading.leakHistory}`
        : ""}
    </p>

    <section class="space-y-3">
      <h2 class="text-sm font-medium">Today, by hour</h2>
      <UsageChart
        periods={data.hourly}
        label={(period: ChartPeriod) => hourLabel.format(period.start)}
        describePeriod={(period: ChartPeriod) =>
          `${hourLabel.format(period.start)}–${hourLabel.format(period.end)}`}
      />
    </section>

    <section class="space-y-3">
      <h2 class="text-sm font-medium">Last {data.daily.length} days</h2>
      {#if !isFresh}
        <p class="text-xs text-muted-foreground">
          Up to when we last heard from the meter, not to now
        </p>
      {/if}
      <UsageChart
        periods={data.daily}
        label={(period: ChartPeriod) => dayLabel.format(period.start)}
        describePeriod={(period: ChartPeriod) => dayName.format(period.start)}
      />
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

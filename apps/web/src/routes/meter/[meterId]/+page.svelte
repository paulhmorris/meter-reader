<script lang="ts">
  import LeakWarnings from "$lib/LeakWarnings.svelte";
  import type { PageData } from "./$types.js";

  let { data }: { data: PageData } = $props();

  const zone = "America/Chicago";
  const gallons = new Intl.NumberFormat(undefined, { minimumFractionDigits: 1 });
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

  type UsagePeriod = PageData["hourly"][number];

  function bars(periods: UsagePeriod[], label: Intl.DateTimeFormat) {
    const peak = Math.max(...periods.map((period) => period.gallons), 0);
    return periods.map((period) => ({
      period,
      label: label.format(period.start),
      height: peak === 0 ? 0 : (period.gallons / peak) * 100,
    }));
  }

  function describe(period: UsagePeriod, label: string): string {
    const used = `${label}: ${gallons.format(period.gallons)} gallons`;
    return period.partial ? `${used}, partial — the meter went unheard from around then` : used;
  }

  const hourly = $derived(bars(data.hourly, hourLabel));
  const daily = $derived(bars(data.daily, dayLabel));

  // The last daily period is today, so the total and the day's bar can never disagree.
  const today = $derived(data.daily.at(-1)?.gallons ?? 0);

  const isFresh = $derived(data.health === "fresh");
</script>

{#snippet chart(bars: { period: UsagePeriod; label: string; height: number }[])}
  <ul class="chart">
    {#each bars as { period, label, height } (period.start.getTime())}
      <li>
        <span class="bar" class:partial={period.partial} style="height: {height}%"></span>
        <span class="label">{label}</span>
        <span class="sr-only">{describe(period, label)}</span>
      </li>
    {/each}
  </ul>
  {#if bars.some(({ period }) => period.partial)}
    <p class="note">
      <span class="key" aria-hidden="true"></span>
      The meter went unheard from around these times, so the water shown for them is too low or too
      high. It is what the readings we do have add up to — we would rather show that than guess.
    </p>
  {/if}
{/snippet}

<svelte:head><title>Meter {data.meterId}</title></svelte:head>

<h1>Meter {data.meterId}</h1>

{#if data.reading}
  {#if data.reading.activeLeak !== "none"}
    <p class="warning active-leak">
      <strong>
        This meter {isFresh ? "is" : "was, when we last heard it,"} reporting a leak.
      </strong>
      {#if data.reading.activeLeak === "continuous"}
        Water ran through it without a break for a whole day. That usually means something is stuck
        open — a running toilet, a valve that has not closed, or a burst pipe.
      {:else if data.reading.activeLeak === "intermittent"}
        Water ran through it in at least half of the day, in short bursts. That usually means
        something is dripping or a toilet is refilling on its own.
      {/if}
      It is worth checking, and worth calling a plumber if you cannot find it.
    </p>
  {/if}

  {#if data.health === "broken"}
    <p class="warning broken">
      We have not picked up this meter for more than three days. Our receiver is most likely down,
      so nothing here is current — it is where the meter stood when we last heard it.
    </p>
  {:else if data.health === "stale"}
    <p class="warning">
      We have not picked up this meter for over a day. Our receiver may be down, so the numbers
      below are the last we heard rather than what the meter reads now.
    </p>
  {/if}

  <p class="consumption">{gallons.format(data.reading.consumption)} <span>gallons</span></p>
  <p class="muted">
    {isFresh ? "Last heard from" : "Last known reading, heard"}
    {heardAt.format(data.reading.receivedAt)}
  </p>

  {#if data.reading.leakHistory}
    <p class="muted">
      Days with a leak, as far back as the meter counts: {data.reading.leakHistory}
    </p>
  {/if}

  <h2>Today, by hour</h2>
  <p class="muted">
    {gallons.format(today)} gallons{isFresh ? " so far" : " on the last readings we have"}
  </p>
  {@render chart(hourly)}

  <h2>Last {data.daily.length} days</h2>
  {#if !isFresh}
    <p class="muted">Up to when we last heard from the meter, not to now</p>
  {/if}
  {@render chart(daily)}

  <h2>What the meter has reported</h2>
  {#if data.events.length > 0}
    <ol class="events">
      {#each data.events as event (event.id)}
        <li>
          <span>{event.description}</span>
          <span class="muted">{heardAt.format(event.occurredAt)}</span>
        </li>
      {/each}
    </ol>
    {#if data.older}
      <p class="muted">Older changes than these are kept, but not shown here.</p>
    {/if}
  {:else}
    <p class="muted">
      Nothing has changed since we started listening — no leaks, no backwards flow, no days without
      water.
    </p>
  {/if}
{:else}
  <p class="warning">
    We have not picked up this meter at all yet. Until our receiver hears it, there is nothing to
    show.
  </p>
{/if}

{#if data.pushKey}
  <LeakWarnings meterId={data.meterId} publicKey={data.pushKey} />
{/if}

<style>
  .consumption {
    font-size: 2.5rem;
    margin: 0;
  }

  .warning {
    border-left: 3px solid var(--warning);
    padding-left: 0.75rem;
    font-size: 0.875rem;
    line-height: 1.4;
  }

  .broken,
  .active-leak {
    border-left-color: var(--broken);
  }

  .events {
    margin: 0;
    padding: 0;
    list-style: none;
    font-size: 0.875rem;
  }

  .events li {
    display: flex;
    flex-direction: column;
    padding: 0.5rem 0;
    border-bottom: 1px solid var(--rule);
  }

  .events .muted {
    font-size: 0.75rem;
  }

  .consumption span {
    font-size: 1rem;
    color: var(--muted);
  }

  .chart {
    display: flex;
    align-items: flex-end;
    gap: 2px;
    height: 8rem;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .chart li {
    display: flex;
    flex: 1;
    flex-direction: column;
    justify-content: flex-end;
    height: 100%;
  }

  .bar {
    background: var(--bar);
    border-radius: 2px 2px 0 0;
    min-height: 1px;
  }

  /* Stripes mark a period whose Usage is off either way, Readings being missing near its edges. */
  .partial,
  .key {
    background: repeating-linear-gradient(45deg, var(--bar) 0 2px, transparent 2px 4px);
  }

  .note {
    display: flex;
    color: var(--muted);
    gap: 0.5rem;
    font-size: 0.75rem;
    line-height: 1.4;
  }

  .key {
    flex: none;
    width: 0.75rem;
    height: 0.75rem;
    margin-top: 0.15rem;
    border-radius: 2px;
  }

  .label {
    font-size: 0.625rem;
    color: var(--muted);
    text-align: center;
    white-space: nowrap;
    overflow: hidden;
  }

  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
  }
</style>

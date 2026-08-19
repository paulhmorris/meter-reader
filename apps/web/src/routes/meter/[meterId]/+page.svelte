<script lang="ts">
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
    return period.partial ? `${used}, partial — readings are missing near its edges` : used;
  }

  const hourly = $derived(bars(data.hourly, hourLabel));
  const daily = $derived(bars(data.daily, dayLabel));

  // The last daily period is today, so the total and the day's bar can never disagree.
  const today = $derived(data.daily.at(-1)?.gallons ?? 0);
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
{/snippet}

<svelte:head><title>Meter {data.meterId}</title></svelte:head>

<h1>Meter {data.meterId}</h1>

{#if data.reading}
  <p class="consumption">{gallons.format(data.reading.consumption)} <span>gallons</span></p>
  <p class="muted">Last heard from {heardAt.format(data.reading.receivedAt)}</p>

  <h2>Today, by hour</h2>
  <p class="muted">{gallons.format(today)} gallons so far</p>
  {@render chart(hourly)}

  <h2>Last {data.daily.length} days</h2>
  {@render chart(daily)}
{:else}
  <p class="muted">This meter has not been heard from yet.</p>
{/if}

<style>
  .consumption {
    font-size: 2.5rem;
    margin: 0;
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
    background: currentColor;
    border-radius: 2px 2px 0 0;
    min-height: 1px;
  }

  /* Readings are missing near this period's edges, so its Usage is off either way (ADR-0002). */
  .partial {
    background: repeating-linear-gradient(
      45deg,
      currentColor 0 2px,
      transparent 2px 4px
    );
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

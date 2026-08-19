<script lang="ts">
  import type { PageData } from "./$types.js";

  let { data }: { data: PageData } = $props();

  const gallons = new Intl.NumberFormat(undefined, { minimumFractionDigits: 1 });
  const heardAt = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" });
</script>

<svelte:head><title>Meter {data.meterId}</title></svelte:head>

<h1>Meter {data.meterId}</h1>

{#if data.reading}
  <p class="consumption">{gallons.format(data.reading.consumption)} <span>gallons</span></p>
  <p class="muted">Last heard from {heardAt.format(data.reading.receivedAt)}</p>
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
</style>

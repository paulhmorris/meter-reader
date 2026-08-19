<script lang="ts">
  import type { PageData } from "./$types.js";

  let { data }: { data: PageData } = $props();

  const heardAt = new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "America/Chicago",
  });

  const HEALTH = { fresh: "", stale: "Stale — unheard for over a day", broken: "Unheard for over three days" };
</script>

<svelte:head><title>Admin — meters</title></svelte:head>

<h1>Meters</h1>
<p class="muted">Every meter the receiver has heard of.</p>

{#if data.meters.length > 0}
  <ul class="meters">
    {#each data.meters as meter (meter.id)}
      <li>
        <a href="/admin/meter/{meter.id}">{meter.id}</a>
        {#if meter.lastHeardAt}
          <span class="muted">Last heard {heardAt.format(meter.lastHeardAt)}</span>
          {#if meter.health !== "fresh"}
            <span class="flag">{HEALTH[meter.health ?? "fresh"]}</span>
          {/if}
          {#if meter.activeLeak !== "none"}
            <span class="flag">Leaking ({meter.activeLeak})</span>
          {/if}
        {:else}
          <span class="muted">Never heard from</span>
        {/if}
      </li>
    {/each}
  </ul>
{:else}
  <p class="muted">The receiver has not heard a meter yet.</p>
{/if}

<style>
  .meters {
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .meters li {
    display: flex;
    flex-direction: column;
    gap: 0.125rem;
    padding: 0.5rem 0;
    border-bottom: 1px solid var(--rule);
  }

  .muted,
  .flag {
    font-size: 0.75rem;
  }

  .flag {
    color: var(--broken);
  }
</style>

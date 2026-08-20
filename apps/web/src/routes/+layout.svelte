<script lang="ts">
  import { invalidateAll } from "$app/navigation";
  import { page } from "$app/state";
  import { startClock } from "$lib/now.svelte.js";
  import "../app.css";

  let { children } = $props();

  /** The Admin list carries a column per statistic, which needs more room than one meter's page. */
  const wide = $derived(page.url.pathname === "/admin");

  /** How long a page may sit unwatched before returning to it is worth a refetch. */
  const STALE_AFTER_MS = 30_000;

  let loadedAt = Date.now();

  $effect(() => startClock());

  /** A tab left open holds what it loaded, so coming back to it fetches rather than lies. */
  function refreshIfStale() {
    if (document.visibilityState !== "visible") return;
    if (Date.now() - loadedAt < STALE_AFTER_MS) return;

    loadedAt = Date.now();
    invalidateAll();
  }
</script>

<svelte:window onfocus={refreshIfStale} />
<svelte:document onvisibilitychange={refreshIfStale} />

<main class="mx-auto w-full px-4 py-8 sm:py-12 {wide ? 'max-w-7xl' : 'max-w-2xl'}">
  {@render children()}
</main>

<script lang="ts">
  import { page } from "$app/state";
  import "../app.css";

  let { children } = $props();

  /** The Admin list carries a column per statistic, which needs more room than one meter's page. */
  const wide = $derived(page.url.pathname === "/admin");
</script>

<main class="mx-auto w-full px-4 py-8 sm:py-12 {wide ? 'max-w-7xl' : 'max-w-2xl'}">
  {@render children()}
</main>

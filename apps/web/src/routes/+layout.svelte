<script lang="ts">
  import "../app.css";

  let { children } = $props();
</script>

<main>
  {@render children()}
</main>

<style>
  main {
    max-width: 24rem;
    margin: 4rem auto;
    padding: 0 1rem;
  }

  :global(.muted) {
    color: var(--muted-foreground);
  }
</style>

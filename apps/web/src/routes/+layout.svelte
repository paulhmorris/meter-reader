<script lang="ts">
  let { children } = $props();
</script>

<main>
  {@render children()}
</main>

<style>
  :global(:root) {
    --muted: #555;
    --bar: canvastext;
    --warning: #b26a00;
    --broken: #b3261e;
  }

  main {
    max-width: 24rem;
    margin: 4rem auto;
    padding: 0 1rem;
    font-family: system-ui, sans-serif;
  }

  :global(.muted) {
    color: var(--muted);
  }
</style>

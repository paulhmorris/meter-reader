<script lang="ts">
  import "../app.css";

  let { children } = $props();
</script>

<main class="mx-auto w-full max-w-2xl px-4 py-8 sm:py-12">
  {@render children()}
</main>

<script lang="ts">
  import type { ChartKind } from "$lib/chart-kind.js";
  import ChartColumn from "@lucide/svelte/icons/chart-column";
  import ChartLine from "@lucide/svelte/icons/chart-line";

  let { kind = $bindable() }: { kind: ChartKind } = $props();

  const CHOICES = [
    { value: "bars" as const, label: "By the hour", Icon: ChartColumn },
    { value: "line" as const, label: "Reading by reading", Icon: ChartLine },
  ];
</script>

<div
  role="group"
  aria-label="How to draw the chart"
  class="inline-flex shrink-0 gap-0.5 rounded-md border border-border p-0.5"
>
  {#each CHOICES as choice (choice.value)}
    {@const chosen = kind === choice.value}
    <button
      type="button"
      aria-pressed={chosen}
      onclick={() => (kind = choice.value)}
      class="flex size-8 items-center justify-center rounded-sm transition-colors {chosen
        ? 'bg-secondary text-secondary-foreground'
        : 'text-muted-foreground hover:bg-accent'}"
    >
      <choice.Icon class="size-4" aria-hidden="true" />
      <span class="sr-only">{choice.label}</span>
    </button>
  {/each}
</div>

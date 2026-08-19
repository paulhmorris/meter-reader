<script lang="ts">
  import { Badge } from "$lib/components/ui/badge/index.js";
  import RadioTower from "@lucide/svelte/icons/radio-tower";
  import TriangleAlert from "@lucide/svelte/icons/triangle-alert";

  type Health = "fresh" | "stale" | "broken";

  let { health, class: className }: { health: Health; class?: string } = $props();

  const LABEL: Record<Health, string> = {
    fresh: "Live",
    stale: "Unheard for over a day",
    broken: "Unheard for over three days",
  };
</script>

{#if health === "fresh"}
  <Badge variant="outline" class="gap-1.5 text-muted-foreground {className}">
    <RadioTower class="size-3" aria-hidden="true" />
    {LABEL.fresh}
  </Badge>
{:else}
  <Badge
    class="gap-1.5 border-transparent {health === 'broken'
      ? 'bg-danger text-danger-foreground'
      : 'bg-warning text-warning-foreground'} {className}"
  >
    <TriangleAlert class="size-3" aria-hidden="true" />
    {LABEL[health]}
  </Badge>
{/if}

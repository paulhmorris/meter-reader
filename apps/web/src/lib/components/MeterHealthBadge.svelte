<script lang="ts">
  import { Badge } from "$lib/components/ui/badge/index.js";
  import RadioTower from "@lucide/svelte/icons/radio-tower";
  import TriangleAlert from "@lucide/svelte/icons/triangle-alert";

  type Health = "fresh" | "stale" | "broken";

  let {
    health,
    short = false,
    class: className,
  }: {
    /** Null is a Meter the receiver has never heard, which leaves nothing to judge. */
    health: Health | null;
    /** The wording a table column has room for, rather than the one a page can spell out. */
    short?: boolean;
    class?: string;
  } = $props();

  const LONG: Record<Health, string> = {
    fresh: "Live",
    stale: "Unheard for over a day",
    broken: "Unheard for over three days",
  };

  const SHORT: Record<Health, string> = { fresh: "Live", stale: "Stale", broken: "Broken" };

  const LABEL = $derived(short ? SHORT : LONG);
</script>

{#if health === null}
  <Badge variant="outline" class="text-muted-foreground {className}">Never heard</Badge>
{:else if health === "fresh"}
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

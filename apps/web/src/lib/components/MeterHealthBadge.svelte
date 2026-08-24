<script lang="ts">
  import { Badge } from "$lib/components/ui/badge/index.js";
  import { now } from "$lib/now.svelte.js";
  import RadioTower from "@lucide/svelte/icons/radio-tower";
  import TriangleAlert from "@lucide/svelte/icons/triangle-alert";

  type Health = "fresh" | "stale" | "broken";

  let {
    health,
    lastHeardAt,
    class: className,
  }: {
    /** Null is a Meter the receiver has never heard, which leaves nothing to judge. */
    health: Health | null;
    lastHeardAt: Date | null;
    class?: string;
  } = $props();

  const HOUR_MS = 60 * 60 * 1000;

  const unheardForMs = $derived(lastHeardAt ? now.ms - lastHeardAt.getTime() : Infinity);
  /** The green window is the last hour, not the whole day Stale allows: a meter reports every 15 minutes. */
  const live = $derived(unheardForMs < HOUR_MS);

  const UNHEARD = {
    stale: { long: "Unheard for over a day", short: "Stale" },
    broken: { long: "Unheard for over three days", short: "Broken" },
  };

  /** Relative rather than a timestamp, so the badge stays a few characters wide beside the title. */
  function ago(ms: number): string {
    const hours = Math.floor(ms / HOUR_MS);
    if (hours < 1) return `${Math.floor(ms / 60_000)}m`;
    if (hours < 24) return `${hours}h`;
    return `${Math.floor(hours / 24)}d`;
  }

  const quiet = $derived(lastHeardAt ? ago(unheardForMs) : "");
</script>

{#if health === null}
  <Badge variant="outline" class="text-muted-foreground {className}">Never heard</Badge>
{:else if health === "fresh" && live}
  <Badge variant="outline" class="border-fresh/40 gap-1.5 text-fresh {className}">
    <RadioTower class="size-3" aria-hidden="true" />
    {quiet}
  </Badge>
{:else if health === "fresh"}
  <Badge variant="outline" class="text-muted-foreground {className}">{quiet}</Badge>
{:else}
  <Badge
    variant="outline"
    class="gap-1.5 {health === 'broken'
      ? 'border-danger/40 bg-danger/5 text-danger'
      : 'border-warning/40 bg-warning/5 text-warning'} {className}"
  >
    <TriangleAlert class="size-3" aria-hidden="true" />
    {UNHEARD[health].short}
  </Badge>
{/if}
